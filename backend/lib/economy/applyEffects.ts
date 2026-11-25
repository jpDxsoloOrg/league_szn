/**
 * Applying shop effects (ECO-10). ECO-08 stores what a player bought on
 * `Player.effects` (and sim interference on `Match.simBoosts`); this module
 * uses them up:
 *
 * - **Injury shield**: while it has `matchesLeft`, INJ-04's injury roll takes
 *   `reduction` off the chance (`injuryShieldReduction`, passed to
 *   `loadMatchConditionPlan` as `chanceReductionFor`). After the result
 *   commits, `consumeInjuryShields` counts one match off each shield that was
 *   used. That writes the player row, so it can't share the result's
 *   transaction (the condition write already owns the row there): it runs in
 *   its own unit of work, like match pay, and never fails the result.
 * - **Rehab** and **stamina top-up** apply right after the purchase
 *   (`applyPendingEffects`): rehab moves the active injury's return one
 *   league week earlier per `weeksOff`, top-up adds stamina up to the
 *   maximum. A rehab bought while the injury ended in the meantime stays
 *   pending until the player has an active injury again.
 * - **Sim boost**: `simBoostModifiers` (lib/sim/loadSimInputs.ts) turns
 *   `Match.simBoosts` into rating modifiers; the official sim uses them and
 *   the result path never refunds them (only a manual result does).
 *
 * Every use goes through `tx.updatePlayerCondition({ useEffect })`, which is
 * guarded on the effect's position and id, so an effect is used exactly once
 * and a racing write is retried from a fresh read.
 */
import { getRepositories } from '../repositories';
import { isConcurrentWriteError } from '../repositories/errors';
import type { UnitOfWork } from '../repositories/unitOfWork';
import type {
  CurrentInjury,
  InjuryChange,
  InjuryPatch,
  PlayerConditionGuard,
  PlayerConditionPatch,
} from '../repositories/injuries';
import type {
  InjuryShieldEffect,
  Player,
  RehabEffect,
  StaminaTopUpEffect,
} from '../repositories/types';
import { activeInjury, currentStamina } from '../injuries';
import { returnDate } from '../policies/fatigue';
import { leagueWeekOf } from '../leagueWeek';
import { isActiveInjuryShield } from './effects';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A racing write to the player row is retried this many times. */
export const EFFECT_WRITE_ATTEMPTS = 3;

type EffectsField = Pick<Player, 'effects'>;

// ─── Injury shield ──────────────────────────────────────────────────

/** The player's active injury shield and where it sits in `effects`, or null. */
export function activeInjuryShield(player: EffectsField): { effect: InjuryShieldEffect; index: number } | null {
  const effects = player.effects ?? [];
  const index = effects.findIndex(isActiveInjuryShield);
  return index === -1 ? null : { effect: effects[index] as InjuryShieldEffect, index };
}

/** Injury chance reduction (0..1) from an active shield; 0 without one. */
export function injuryShieldReduction(player: EffectsField): number {
  return activeInjuryShield(player)?.effect.reduction ?? 0;
}

/**
 * After a result commits: count one match off the active shield of each
 * player whose roll it reduced. Each player is its own unit of work, read
 * fresh. A player whose shield is already gone (two results raced on its
 * last match) is skipped. Logs failures; never throws.
 */
export async function consumeInjuryShields(playerIds: readonly string[]): Promise<void> {
  const { roster: { players }, runInTransaction } = getRepositories();
  for (const playerId of new Set(playerIds)) {
    for (let attempt = 1; attempt <= EFFECT_WRITE_ATTEMPTS; attempt++) {
      try {
        const player = await players.findById(playerId);
        const shield = player ? activeInjuryShield(player) : null;
        if (!shield) break;
        const before = shield.effect.matchesLeft;
        await runInTransaction(async (tx) => {
          tx.updatePlayerCondition(playerId, {
            useEffect: {
              effectId: shield.effect.effectId,
              index: shield.index,
              matchesLeft: { before, after: before - 1 },
            },
          });
        });
        break;
      } catch (err) {
        if (isConcurrentWriteError(err) && attempt < EFFECT_WRITE_ATTEMPTS) continue;
        console.error(`Injury shield use failed for ${playerId}:`, err);
        break;
      }
    }
  }
}

// ─── Rehab ──────────────────────────────────────────────────────────

/**
 * The return date after rehab: `weeksOff` league weeks earlier, still on a
 * week boundary (Sunday 00:00 league time, INJ-02 `returnDate`). Never earlier
 * than one week from the injury's start, never before the next boundary from
 * `now`, and never later than it was.
 */
export function rehabReturnDate(
  injury: Pick<CurrentInjury, 'startedAt' | 'returnsAt'>,
  weeksOff: number,
  now: Date | string,
  timezone: string,
): string {
  const current = Date.parse(injury.returnsAt);
  const weeks = Math.max(0, Math.trunc(weeksOff));
  // Land mid-week, then snap to that week's start: robust to DST hours.
  const moved = leagueWeekOf(new Date(current - weeks * WEEK_MS + DAY_MS / 2), timezone).weekStart.getTime();
  const oneWeekFromStart = returnDate(injury.startedAt, 1, timezone).getTime();
  const nextBoundary = returnDate(now, 0, timezone).getTime();
  return new Date(Math.min(current, Math.max(moved, oneWeekFromStart, nextBoundary))).toISOString();
}

/** The injury's length after its return moved earlier: one week less per boundary moved, at least 1. */
function weeksAfterRehab(weeks: number, returnsAtBefore: string, returnsAtAfter: string): number {
  const weeksMoved = Math.round((Date.parse(returnsAtBefore) - Date.parse(returnsAtAfter)) / WEEK_MS);
  return Math.max(1, weeks - weeksMoved);
}

export interface RehabPlan {
  injuryStartedAt: string;
  injuryPatch: InjuryPatch;
  conditionPatch: PlayerConditionPatch;
  guard: PlayerConditionGuard;
}

/** Pure: the writes for using `effect` (at `index`) on the player's active injury; null without one. */
export function planRehab(
  player: Pick<Player, 'playerId' | 'userId' | 'currentInjury'>,
  effect: RehabEffect,
  index: number,
  now: string,
  timezone: string,
): RehabPlan | null {
  const injury = activeInjury(player, now);
  if (!injury) return null;
  const returnsAt = rehabReturnDate(injury, effect.weeksOff, now, timezone);
  const weeks = weeksAfterRehab(injury.weeks, injury.returnsAt, returnsAt);
  const change: InjuryChange = {
    kind: 'rehab',
    at: now,
    by: player.userId || player.playerId,
    returnsAtBefore: injury.returnsAt,
    returnsAtAfter: returnsAt,
    weeksBefore: injury.weeks,
    weeksAfter: weeks,
  };
  return {
    injuryStartedAt: injury.startedAt,
    injuryPatch: { returnsAt, weeks, appendChanges: [change] },
    conditionPatch: {
      currentInjury: { ...injury, returnsAt, weeks },
      useEffect: { effectId: effect.effectId, index },
    },
    guard: { currentInjuryId: injury.injuryId },
  };
}

// ─── Stamina top-up ─────────────────────────────────────────────────

/** Stamina after a top-up: `amount` added, capped at `maxStamina`. */
export function toppedUpStamina(stamina: number, amount: number, maxStamina: number): number {
  return Math.min(maxStamina, Math.max(0, stamina) + Math.max(0, amount));
}

/** Pure: the write for using a stamina top-up (at `index`). */
export function planStaminaTopUp(
  player: Pick<Player, 'stamina' | 'currentInjury'>,
  effect: StaminaTopUpEffect,
  index: number,
  maxStamina: number,
): { patch: PlayerConditionPatch; guard: PlayerConditionGuard } {
  return {
    patch: {
      stamina: toppedUpStamina(currentStamina(player, maxStamina), effect.amount, maxStamina),
      useEffect: { effectId: effect.effectId, index },
    },
    guard: { stamina: typeof player.stamina === 'number' ? player.stamina : null },
  };
}

// ─── Pending effects ────────────────────────────────────────────────

/** Most effects one call applies; a player has at most a handful pending. */
const MAX_EFFECTS_PER_CALL = 10;

/**
 * Applies the player's pending rehab and stamina top-ups, one unit of work
 * each, oldest first. Called right after a purchase (and again when the
 * purchase is retried), so an effect whose write failed is picked up later.
 * Returns the ids of the effects it used. Never throws for a racing write.
 */
export async function applyPendingEffects(playerId: string, now: Date = new Date()): Promise<string[]> {
  const repos = getRepositories();
  const { roster: { players }, runInTransaction } = repos;
  const tunables = await repos.user.siteConfig.getInjuryTunables();
  const nowIso = now.toISOString();
  const applied: string[] = [];
  let conflicts = 0;

  for (let round = 0; round < MAX_EFFECTS_PER_CALL && conflicts < EFFECT_WRITE_ATTEMPTS; round++) {
    const player = await players.findById(playerId);
    if (!player || player.deletedAt) break;

    const effects = player.effects ?? [];
    let staged: ((tx: UnitOfWork) => void) | null = null;
    let effectId = '';
    for (let index = 0; index < effects.length && !staged; index++) {
      const effect = effects[index];
      if (effect.kind === 'staminaTopUp') {
        const { patch, guard } = planStaminaTopUp(player, effect, index, tunables.maxStamina);
        staged = (tx) => tx.updatePlayerCondition(playerId, patch, guard);
        effectId = effect.effectId;
      } else if (effect.kind === 'rehab') {
        const plan = planRehab(player, effect, index, nowIso, tunables.timezone);
        if (!plan) continue; // No active injury: it waits for one.
        staged = (tx) => {
          tx.updateInjury(playerId, plan.injuryStartedAt, plan.injuryPatch);
          tx.updatePlayerCondition(playerId, plan.conditionPatch, plan.guard);
        };
        effectId = effect.effectId;
      }
    }
    if (!staged) break;

    const stage = staged;
    try {
      await runInTransaction(async (tx) => stage(tx));
      applied.push(effectId);
    } catch (err) {
      if (!isConcurrentWriteError(err)) throw err;
      conflicts++;
    }
  }
  return applied;
}
