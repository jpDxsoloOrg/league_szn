import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

interface OnlinePlayerResponse {
  playerId: string;
  name: string;
  currentWrestler: string;
  imageUrl?: string;
  lastSeenAt: string;
  inQueue: boolean;
}

const PRESENCE_WINDOW_MS = 3 * 60 * 1000;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can view online players');
    }

    const { players, matchmaking } = getRepositories();

    // Find the caller's player record via their user sub
    const callerPlayer = await players.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const callerPlayerId = callerPlayer.playerId;

    const [presenceItems, queueItems] = await Promise.all([
      matchmaking.listPresence(),
      matchmaking.listQueue(),
    ]);

    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    const cutoff = now - PRESENCE_WINDOW_MS;

    // Build set of players currently in the queue (skip expired rows)
    const inQueueSet = new Set<string>();
    for (const row of queueItems) {
      if (!row.playerId) continue;
      if (typeof row.ttl === 'number' && row.ttl < nowSeconds) continue;
      inQueueSet.add(row.playerId);
    }

    // Filter presence rows to those within the 3-minute window, excluding caller
    const livePresence: Array<{ playerId: string; lastSeenAt: string }> = [];
    for (const row of presenceItems) {
      if (!row.playerId || !row.lastSeenAt) continue;
      if (row.playerId === callerPlayerId) continue;
      const seenAt = Date.parse(row.lastSeenAt);
      if (Number.isNaN(seenAt)) continue;
      if (seenAt <= cutoff) continue;
      livePresence.push(row);
    }

    // Hydrate with player records in parallel
    const playerResults = await Promise.all(
      livePresence.map((row) => players.findById(row.playerId))
    );

    const response: OnlinePlayerResponse[] = [];
    for (let i = 0; i < livePresence.length; i++) {
      const presence = livePresence[i];
      const playerItem = playerResults[i];
      if (!playerItem || !playerItem.playerId) continue;

      const entry: OnlinePlayerResponse = {
        playerId: playerItem.playerId,
        name: playerItem.name || '',
        currentWrestler: playerItem.currentWrestler || '',
        lastSeenAt: presence.lastSeenAt,
        inQueue: inQueueSet.has(playerItem.playerId),
      };
      if (playerItem.imageUrl) {
        entry.imageUrl = playerItem.imageUrl;
      }
      response.push(entry);
    }

    return success(response);
  } catch (err) {
    console.error('Error fetching online players:', err);
    return serverError('Failed to fetch online players');
  }
};
