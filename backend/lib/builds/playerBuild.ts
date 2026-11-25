/**
 * A player's build as the API shows it (BLD-03).
 *
 * The build lives on the Players item (`Player.build`); move levels live on
 * `Player.signatures` / `Player.finishers`. Nothing derived is stored: the
 * cost, the budget and `overBudget` are computed on every read from the
 * player's current division, so a division move never leaves a stale flag.
 *
 * Used by the players routes, and meant for the build budget notice (BLD-04)
 * and the sim loader (BLD-07).
 */
import type { Division, Player, WrestlerBuild, WrestlerMove } from '../repositories/types';
import { budgetForDivision, MOVE_LEVEL_MIN, RULES_VERSION } from '../policies/buildRules';
import {
  budgetStatus,
  buildCost,
  defaultBuild,
  effectiveBuild,
  type BudgetStatus,
  type EffectiveBuild,
} from '../policies/wrestlerBuild';

type BuildPlayer = Pick<Player, 'playerId' | 'build' | 'signatures' | 'finishers'>;

/** A move with its level filled in (unset reads as 1). */
export interface LeveledWrestlerMove extends WrestlerMove {
  level: number;
}

export interface PlayerBuildView {
  playerId: string;
  /** The saved build, or `defaultBuild()` when the player has never saved one. */
  build: WrestlerBuild;
  /** True when `build` is the default because nothing was saved. */
  isDefault: boolean;
  moves: { signatures: LeveledWrestlerMove[]; finishers: LeveledWrestlerMove[] };
  /** Cost of the saved build against the budget of the player's current division. */
  budget: BudgetStatus;
  /** What the sim uses: scaled down when over budget, plus the style bonus. */
  effective: EffectiveBuild;
  rulesVersion: number;
}

/** The player's saved build, or the default. */
export function buildOrDefault(player: Pick<Player, 'build'>): WrestlerBuild {
  return player.build ?? defaultBuild();
}

function withLevels(moves: readonly WrestlerMove[] | undefined): LeveledWrestlerMove[] {
  return (moves ?? []).map((move) => ({ ...move, level: move.level ?? MOVE_LEVEL_MIN }));
}

/** Cost of the player's build (stats plus move levels). */
export function playerBuildCost(player: Pick<Player, 'build' | 'signatures' | 'finishers'>): number {
  return buildCost(buildOrDefault(player), player.signatures, player.finishers);
}

/**
 * Shape the player's build for the API. `division` is the player's current
 * division (undefined when they have none or it no longer exists).
 */
export function toPlayerBuildView(
  player: BuildPlayer,
  division: Pick<Division, 'tier' | 'isDevelopmental'> | null | undefined,
): PlayerBuildView {
  const build = buildOrDefault(player);
  const budget = budgetForDivision(division);
  const moves = { signatures: player.signatures, finishers: player.finishers };
  return {
    playerId: player.playerId,
    build,
    isDefault: player.build === undefined,
    moves: { signatures: withLevels(player.signatures), finishers: withLevels(player.finishers) },
    budget: budgetStatus(buildCost(build, moves.signatures, moves.finishers), budget),
    effective: effectiveBuild(build, moves, budget),
    rulesVersion: RULES_VERSION,
  };
}
