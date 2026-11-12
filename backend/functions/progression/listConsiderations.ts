import type { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { badRequest, serverError, success } from '../../lib/response';
import { isPlayerVisible, realWrestlerName } from '../../lib/needsWrestler';
import { isProgressionKind, listActiveConsiderations } from '../../lib/progression/considerations';

export interface ConsiderationListItem {
  playerId: string;
  name: string;
  wrestlerName: string;
  trackId: string;
  markedAt: string;
}

/**
 * GET /progression/considerations?kind=callup (public)
 *
 * Players currently being considered on an active track of `kind` (default
 * `callup`), newest mark first, for the ticker and profile banners. Notes and
 * who marked them stay private. Deleted, deactivated and hidden (no wrestler)
 * players are left out, as on other public lists.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const kind = event.queryStringParameters?.kind ?? 'callup';
  if (!isProgressionKind(kind)) return badRequest('kind must be one of callup, promotion, relegation');

  try {
    const considerations = await listActiveConsiderations(kind);
    // Few players are flagged at once, so point reads beat scanning Players.
    const { roster: { players } } = getRepositories();
    const found = await Promise.all(considerations.map((c) => players.findById(c.playerId)));

    const items: ConsiderationListItem[] = [];
    considerations.forEach((c, index) => {
      const player = found[index];
      if (!player || !isPlayerVisible(player)) return;
      items.push({
        playerId: c.playerId,
        name: player.name,
        wrestlerName: realWrestlerName(player.currentWrestler) ?? '',
        trackId: c.trackId,
        markedAt: c.consideration.markedAt,
      });
    });

    return success(items);
  } catch (err) {
    console.error('Error listing progression considerations:', err);
    return serverError('Failed to list considerations');
  }
};
