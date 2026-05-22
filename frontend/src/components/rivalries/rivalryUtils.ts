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
