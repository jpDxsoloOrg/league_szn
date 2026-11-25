/*
 * Injury and stamina helpers for staff booking screens (INJ-11). The server
 * runs the real gate (INJ-06); these only decide what the pickers show.
 */
import type { Player } from '../types';
import type { PlayerWithCondition } from '../types/injuryReport';
import { ApiError } from '../services/api/apiClient';

/** Stamina below this shows beside a player's name and is highlighted on the board. */
export const LOW_STAMINA_THRESHOLD = 40;

/** What the pickers need to know about each player's condition. */
export interface BookingCondition {
  /** Players injured right now, with when they return. */
  injuredUntil: ReadonlyMap<string, string>;
  /** Players whose stamina is below LOW_STAMINA_THRESHOLD. */
  lowStamina: ReadonlyMap<string, number>;
  /** True once a GM ticked "Allow injured": injured players become pickable. */
  allowInjured: boolean;
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/** Staff reads of GET /players carry stamina and the current injury. */
const withCondition = (player: Player): PlayerWithCondition => player as PlayerWithCondition;

/** When the player's current injury ends, or null when they are fit at `now`. */
export function injuredUntil(player: Player, now: number = Date.now()): string | null {
  const returnsAt = withCondition(player).currentInjury?.returnsAt;
  return returnsAt && Date.parse(returnsAt) > now ? returnsAt : null;
}

/** The stored stamina, or null when none is stored (full). */
export function staminaOf(player: Player): number | null {
  const stamina = withCondition(player).stamina;
  return typeof stamina === 'number' ? stamina : null;
}

export function isLowStamina(stamina: number | null): stamina is number {
  return stamina !== null && stamina < LOW_STAMINA_THRESHOLD;
}

/**
 * The picker condition for these players, or undefined while the injuries
 * feature is off (the pickers then behave as before).
 */
export function buildBookingCondition(
  players: readonly Player[],
  enabled: boolean,
  allowInjured: boolean,
  now: number = Date.now(),
): BookingCondition | undefined {
  if (!enabled) return undefined;
  const injured = new Map<string, string>();
  const low = new Map<string, number>();
  for (const player of players) {
    const returnsAt = injuredUntil(player, now);
    if (returnsAt) injured.set(player.playerId, returnsAt);
    const stamina = staminaOf(player);
    if (isLowStamina(stamina)) low.set(player.playerId, stamina);
  }
  return { injuredUntil: injured, lowStamina: low, allowInjured };
}

/** True when picking this player needs the override. Already-picked players stay clickable. */
export function isPickBlocked(condition: BookingCondition | undefined, playerId: string, selected: boolean): boolean {
  return !!condition && !condition.allowInjured && !selected && condition.injuredUntil.has(playerId);
}

/** A return date in the viewer's locale, e.g. "Sun, Dec 7". */
export function formatReturnDate(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * The translated 409 PLAYER_INJURED message, or null for any other error.
 * `nameOf` resolves the refused player's display name.
 */
export function injuryRefusalMessage(
  err: unknown,
  t: TranslateFn,
  nameOf: (playerId: string) => string | undefined,
  locale?: string,
): string | null {
  if (!(err instanceof ApiError) || err.code !== 'PLAYER_INJURED') return null;
  const { playerId: rawPlayerId, returnsAt: rawReturnsAt } = err.details;
  const playerId = typeof rawPlayerId === 'string' ? rawPlayerId : '';
  const returnsAt = typeof rawReturnsAt === 'string' ? rawReturnsAt : '';
  const name = (playerId && nameOf(playerId)) || t('injuryReport.booking.thisPlayer');
  if (!returnsAt) return t('injuryReport.booking.refusedNoDate', { name });
  return t('injuryReport.booking.refused', { name, date: formatReturnDate(returnsAt, locale) });
}
