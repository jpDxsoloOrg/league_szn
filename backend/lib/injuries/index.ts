/**
 * Reading a player's stamina and injury state (INJ-03). Pure: no I/O.
 *
 * The data model lives in `lib/repositories/injuries.ts`; the drain, roll and
 * recovery math is INJ-02 (`lib/policies/fatigue.ts`).
 */
import type { CurrentInjury } from '../repositories/injuries';
import type { Player } from '../repositories/types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type ConditionFields = Pick<Player, 'stamina' | 'currentInjury'>;

const toMs = (value: Date | string): number => (typeof value === 'string' ? Date.parse(value) : value.getTime());

/**
 * The player's open injury while it still keeps them out, else null. An
 * injury whose `returnsAt` has passed no longer counts, even before the
 * weekly recovery job clears it.
 */
export function activeInjury(player: ConditionFields, now: Date | string): CurrentInjury | null {
  const injury = player.currentInjury;
  if (!injury) return null;
  return Date.parse(injury.returnsAt) > toMs(now) ? injury : null;
}

/** True while the player has an injury that has not reached `returnsAt`. */
export function isInjured(player: ConditionFields, now: Date | string): boolean {
  return activeInjury(player, now) !== null;
}

/**
 * Whole weeks until the player returns, rounded up, or null when they are not
 * injured. The shop's rehab check (ECO-10) reads this.
 */
export function injuryWeeksLeft(player: ConditionFields, now: Date | string): number | null {
  const injury = activeInjury(player, now);
  if (!injury) return null;
  return Math.ceil((Date.parse(injury.returnsAt) - toMs(now)) / WEEK_MS);
}

/** Stored stamina, or `maxStamina` when none is stored yet (missing means full). */
export function currentStamina(player: ConditionFields, maxStamina: number): number {
  return typeof player.stamina === 'number' ? player.stamina : maxStamina;
}
