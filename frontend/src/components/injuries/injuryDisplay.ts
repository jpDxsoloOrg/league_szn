import type { PublicCurrentInjury } from '../../types/injury';

/**
 * Display helpers for stamina and injuries (INJ-12). Copy stays neutral: an
 * injury says when the player returns, never why or how bad it looks.
 */

/** The meter colour, from the injury-chance band the stamina falls in. */
export type StaminaTone = 'high' | 'mid' | 'low';

export function staminaTone(band: number, bandCount: number): StaminaTone {
  if (bandCount <= 1 || band <= 0) return 'high';
  if (band >= bandCount - 1) return 'low';
  return 'mid';
}

/**
 * The injury while it still keeps the player out, else null. A row can keep
 * an injury after its return date until the weekly recovery clears it.
 */
export function activeInjury(
  injury: PublicCurrentInjury | null | undefined,
  now: Date = new Date(),
): PublicCurrentInjury | null {
  if (!injury) return null;
  return Date.parse(injury.returnsAt) > now.getTime() ? injury : null;
}

/** A return or match date in the viewer's locale and time zone, e.g. "Sun, 30 Nov". */
export function formatInjuryDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** The weekly recovery moment with the time, in the viewer's time zone, e.g. "Sun, 30 Nov, 06:00". */
export function formatRecoveryTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
