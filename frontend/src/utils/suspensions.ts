import type { TFunction } from 'i18next';
import type { Player, PlayerSuspension } from '../types';
import { formatShortDate } from './bookingRecency';

/** True when the player carries an active suspension. Bookability is unaffected. */
export function isPlayerSuspended(player: Pick<Player, 'suspension'>): boolean {
  return player.suspension != null;
}

/**
 * Tooltip text for the booking picker chip:
 * "Suspended until Sep 30" / "Suspended for 3 shows since Sep 10".
 * Falls back to the bare "Suspended" label when the suspension has neither condition.
 */
export function formatSuspensionTooltip(suspension: PlayerSuspension, t: TFunction): string {
  if (suspension.until) {
    return t('events.booking.suspendedUntil', { date: formatShortDate(suspension.until) });
  }
  if (suspension.showsRequired != null) {
    return t('events.booking.suspendedShows', {
      count: suspension.showsRequired,
      date: formatShortDate(suspension.suspendedAt),
    });
  }
  return t('events.booking.suspended');
}
