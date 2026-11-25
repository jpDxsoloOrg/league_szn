/**
 * Build budget notice on division moves (BLD-04).
 *
 * A move can give a player a smaller build budget (a relegation, a transfer,
 * or a GM clearing or changing their division). Nothing is stored on the
 * player: `overBudget` and the scaled-down `effectiveBuild` are computed on
 * every read from the current division (BLD-03), so the sim already uses the
 * scaled build until the player re-spends. This module only tells the player.
 *
 * Rules:
 *   - Notify only when the move lowers the budget AND the build costs more
 *     than the new budget. A promotion or a same-budget move sends nothing.
 *   - One notification per move. The copy is neutral: it never says
 *     "relegated", only that the build is over the new budget.
 *   - Best effort: called after the move has been written, so a failure is
 *     logged and never undoes or fails the move.
 */
import { getRepositories } from '../repositories';
import type { Division, Player } from '../repositories/types';
import { createNotification } from '../notifications';
import { budgetForDivision } from '../policies/buildRules';
import { playerBuildCost } from './playerBuild';

type BudgetDivision = Pick<Division, 'tier' | 'isDevelopmental'>;

export type BudgetNoticePlayer = Pick<Player, 'playerId' | 'userId' | 'build' | 'signatures' | 'finishers'>;

export interface OverBudgetAfterMove {
  cost: number;
  previousBudget: number;
  budget: number;
  /** Points the build is over the new budget (always > 0). */
  overBy: number;
}

/**
 * Pure check: did moving from `fromDivision` to `toDivision` leave the build
 * over a smaller budget? Returns null when no notice is due. A missing
 * division (none, or deleted) uses the no-division budget.
 */
export function overBudgetAfterMove(
  player: Pick<Player, 'build' | 'signatures' | 'finishers'>,
  fromDivision: BudgetDivision | null | undefined,
  toDivision: BudgetDivision | null | undefined,
): OverBudgetAfterMove | null {
  const previousBudget = budgetForDivision(fromDivision);
  const budget = budgetForDivision(toDivision);
  if (budget >= previousBudget) return null;
  const cost = playerBuildCost(player);
  if (cost <= budget) return null;
  return { cost, previousBudget, budget, overBy: cost - budget };
}

/** The notification text. Neutral: no mention of why the budget changed. */
export function overBudgetMessage(overBy: number): string {
  const points = overBy === 1 ? '1 point' : `${overBy} points`;
  return `Your build is over your new budget by ${points}. Re-spend before your next match.`;
}

export interface BuildBudgetNoticeInput {
  /** The player as written by the move (its build and moves are priced). */
  player: BudgetNoticePlayer;
  fromDivisionId?: string | null;
  toDivisionId?: string | null;
  /** Divisions already loaded by the caller; looked up by id when omitted. */
  divisions?: readonly Division[];
}

async function resolveDivision(
  divisionId: string | null | undefined,
  loaded: readonly Division[] | undefined,
): Promise<Division | undefined> {
  if (!divisionId) return undefined;
  if (loaded) return loaded.find((division) => division.divisionId === divisionId);
  const found = await getRepositories().leagueOps.divisions.findById(divisionId);
  return found ?? undefined;
}

/**
 * Notify the player when a division move left their build over a smaller
 * budget. Call once per move, after the move is written. Never throws;
 * returns whether a notification was sent.
 */
export async function notifyBuildOverBudgetAfterMove(input: BuildBudgetNoticeInput): Promise<boolean> {
  const { player } = input;
  if (!player.userId) return false;
  if ((input.fromDivisionId ?? undefined) === (input.toDivisionId ?? undefined)) return false;
  try {
    const [fromDivision, toDivision] = await Promise.all([
      resolveDivision(input.fromDivisionId, input.divisions),
      resolveDivision(input.toDivisionId, input.divisions),
    ]);
    const over = overBudgetAfterMove(player, fromDivision, toDivision);
    if (!over) return false;
    await createNotification({
      userId: player.userId,
      type: 'build_over_budget',
      message: overBudgetMessage(over.overBy),
      sourceId: player.playerId,
      sourceType: 'build',
    });
    return true;
  } catch (err) {
    console.warn(`Build budget notice failed for player ${player.playerId}:`, err);
    return false;
  }
}
