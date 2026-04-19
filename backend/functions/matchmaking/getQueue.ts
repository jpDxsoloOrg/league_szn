import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

interface QueuePreferences {
  matchFormat?: string;
  stipulationId?: string;
}

interface QueueEntryResponse {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  preferences: QueuePreferences;
  joinedAt: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can view the matchmaking queue');
    }

    const { roster: { players }, leagueOps: { matchmaking } } = getRepositories();

    // Find the caller's player record via their user sub
    const callerPlayer = await players.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    // Fetch all queue rows
    const queueItems = await matchmaking.listQueue();

    const nowSeconds = Math.floor(Date.now() / 1000);

    const activeRows = queueItems.filter((row) => {
      if (!row.playerId) return false;
      if (typeof row.ttl === 'number' && row.ttl < nowSeconds) return false;
      return true;
    });

    // Hydrate with player records (individual gets; queue is expected to be small)
    const playerResults = await Promise.all(
      activeRows.map((row) => players.findById(row.playerId))
    );

    const response: QueueEntryResponse[] = [];
    for (let i = 0; i < activeRows.length; i++) {
      const row = activeRows[i];
      const player = playerResults[i];
      if (!player || !player.playerId) continue; // skip orphaned rows

      const entry: QueueEntryResponse = {
        playerId: player.playerId,
        name: player.name || '',
        currentWrestler: player.currentWrestler || '',
        preferences: {
          matchFormat: row.preferences?.matchFormat,
          stipulationId: row.preferences?.stipulationId,
        },
        joinedAt: row.joinedAt,
      };
      if (player.imageUrl) {
        entry.imageUrl = player.imageUrl;
      }
      response.push(entry);
    }

    return success(response);
  } catch (err) {
    console.error('Error fetching matchmaking queue:', err);
    return serverError('Failed to fetch matchmaking queue');
  }
};
