import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);
    const { roster: { players, transfers }, leagueOps: { divisions } } = getRepositories();

    const player = await players.findByUserId(sub);

    if (!player) {
      return notFound('No player profile found for this user');
    }

    const playerId = player.playerId;

    const requests = await transfers.listByPlayer(playerId);

    // Collect unique division IDs to join names
    const divisionIds = new Set<string>();
    for (const req of requests) {
      divisionIds.add(req.fromDivisionId);
      divisionIds.add(req.toDivisionId);
    }

    const divisionsMap = new Map<string, string>();
    await Promise.all(
      Array.from(divisionIds).map(async (divisionId) => {
        const division = await divisions.findById(divisionId);
        if (division) {
          divisionsMap.set(divisionId, division.name);
        }
      })
    );

    const enriched = requests.map((req) => ({
      ...req,
      fromDivisionName: divisionsMap.get(req.fromDivisionId) ?? req.fromDivisionId,
      toDivisionName: divisionsMap.get(req.toDivisionId) ?? req.toDivisionId,
    }));

    enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return success(enriched);
  } catch (err) {
    console.error('Error fetching transfer requests:', err);
    return serverError('Failed to fetch transfer requests');
  }
};
