import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);
    const { players, storylineRequests } = getRepositories();

    const player = await players.findByUserId(sub);
    if (!player) {
      return notFound('No player profile found for this user');
    }

    const requesterId = player.playerId;

    const requests = await storylineRequests.listByRequester(requesterId);

    // Collect target player IDs and resolve names
    const targetIds = new Set<string>();
    for (const req of requests) {
      for (const pid of req.targetPlayerIds || []) targetIds.add(pid);
    }

    const playersMap = new Map<string, string>();
    await Promise.all(
      Array.from(targetIds).map(async (playerId) => {
        const targetPlayer = await players.findById(playerId);
        if (targetPlayer) {
          playersMap.set(playerId, targetPlayer.name);
        }
      })
    );

    const enriched = requests.map((req) => ({
      ...req,
      targetPlayerNames: (req.targetPlayerIds || []).map(
        (pid) => playersMap.get(pid) ?? 'Unknown Player'
      ),
    }));

    enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return success(enriched);
  } catch (err) {
    console.error('Error fetching my storyline requests:', err);
    return serverError('Failed to fetch storyline requests');
  }
};
