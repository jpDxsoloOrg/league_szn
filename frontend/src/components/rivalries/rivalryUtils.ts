import type { Player } from '../../types';
import type { RivalryParticipant, WrestlerVariant } from '../../types/rivalry';

/**
 * Resolve the display name of a wrestler in a rivalry. Honors the
 * participant's chosen `wrestlerVariant`; falls back to the player's
 * primary wrestler if alternate is selected but missing, then to the
 * player's name, then to the playerId.
 */
export function resolveWrestlerName(
  participant: RivalryParticipant | undefined,
  player: Player | undefined,
): string {
  if (!participant) return '—';
  const variant: WrestlerVariant = participant.wrestlerVariant ?? 'primary';
  if (player) {
    if (variant === 'alternate' && player.alternateWrestler) {
      return player.alternateWrestler;
    }
    if (player.currentWrestler) return player.currentWrestler;
    if (player.name) return player.name;
  }
  return participant.playerId;
}

/**
 * Build the parenthesised player/PSN suffix for a wrestler name. Returns
 * an empty string when neither field is set so callers can append
 * unconditionally.
 */
function buildPlayerSuffix(player: Player | undefined): string {
  if (!player) return '';
  const playerName = player.name?.trim();
  const psn = player.psnId?.trim();
  const parts: string[] = [];
  if (playerName) parts.push(playerName);
  if (psn) parts.push(psn);
  return parts.length > 0 ? ` (${parts.join(' · ')})` : '';
}

/**
 * Full-fat wrestler label matching the format used in the event detail
 * match-card: `WrestlerName (PlayerName · PSN)`. PSN is dropped when the
 * player has no psnId; the parens are dropped entirely if neither
 * playerName nor PSN are known. Used across the rivalry views so a fan
 * can tell which player is behind a given wrestler in the same glance.
 */
export function resolveWrestlerFullLabel(
  participant: RivalryParticipant | undefined,
  player: Player | undefined,
): string {
  return resolveWrestlerName(participant, player) + buildPlayerSuffix(player);
}

/**
 * Variant of `resolveWrestlerFullLabel` for callers that only have a
 * Player (no RivalryParticipant), e.g. match-history lists where the
 * participant set is a flat playerId[] on the match itself. Always uses
 * the player's currentWrestler — no alternate-variant lookup since there
 * is no rivalry participant context to read from.
 */
export function resolvePlayerFullLabel(
  player: Player | undefined,
  fallback: string,
): string {
  if (!player) return fallback;
  const wrestler = player.currentWrestler || player.name || fallback;
  return wrestler + buildPlayerSuffix(player);
}
