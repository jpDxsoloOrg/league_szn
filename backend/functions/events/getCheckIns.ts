import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import type { EventCheckInStatus } from '../../lib/repositories/types';

type RosterBucket = EventCheckInStatus | 'noResponse';

interface PlayerSummary {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  divisionId?: string;
}

interface CheckInsResponse {
  available: PlayerSummary[];
  tentative: PlayerSummary[];
  unavailable: PlayerSummary[];
  noResponse: PlayerSummary[];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Admin', 'Moderator')) {
      return forbidden('Only admins and moderators can view event check-ins');
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return badRequest('eventId is required');
    }

    const { events, players } = getRepositories();

    // Fetch all check-in rows for this event.
    const checkInItems = await events.listCheckIns(eventId);

    const statusByPlayerId = new Map<string, EventCheckInStatus>();
    for (const item of checkInItems) {
      if (item.playerId && item.status) {
        statusByPlayerId.set(item.playerId, item.status);
      }
    }

    // TODO: optimize with role-based GSI for larger leagues
    const playerItems = await players.list();

    const response: CheckInsResponse = {
      available: [],
      tentative: [],
      unavailable: [],
      noResponse: [],
    };

    for (const player of playerItems) {
      if (!player.playerId) continue;
      // Only include players who have a wrestler assigned (exclude Fantasy-only users)
      if (!player.currentWrestler) continue;

      const summary: PlayerSummary = {
        playerId: player.playerId,
        name: player.name || '',
        currentWrestler: player.currentWrestler || '',
      };
      if (player.imageUrl) {
        summary.imageUrl = player.imageUrl;
      }
      if (player.divisionId) {
        summary.divisionId = player.divisionId;
      }

      const status = statusByPlayerId.get(player.playerId);
      const bucket: RosterBucket = status ?? 'noResponse';
      response[bucket].push(summary);
    }

    return success(response);
  } catch (err) {
    console.error('Error fetching event check-ins:', err);
    return serverError('Failed to fetch event check-ins');
  }
};
