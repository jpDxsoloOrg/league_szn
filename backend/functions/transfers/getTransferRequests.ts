import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import type { TransferRequest, Player, Division } from '../../lib/repositories/types';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const statusFilter = event.queryStringParameters?.status;
    const { roster: { transfers, players: playersRepo }, leagueOps: { divisions: divisionsRepo } } = getRepositories();

    let requests: TransferRequest[];

    if (statusFilter) {
      requests = await transfers.listByStatus(statusFilter);
    } else {
      requests = await transfers.list();
    }

    // Collect unique player/division IDs
    const playerIds = new Set<string>(requests.map((r) => r.playerId));
    const divisionIds = new Set<string>();
    for (const req of requests) {
      divisionIds.add(req.fromDivisionId);
      divisionIds.add(req.toDivisionId);
    }

    const [players, divisions] = await Promise.all([
      playersRepo.list(),
      divisionsRepo.list(),
    ]);

    const playersMap = new Map<string, string>(
      (players as Player[])
        .filter((p) => playerIds.has(p.playerId))
        .map((p) => [p.playerId, p.name])
    );

    const divisionsMap = new Map<string, string>(
      (divisions as Division[])
        .filter((d) => divisionIds.has(d.divisionId))
        .map((d) => [d.divisionId, d.name])
    );

    const enriched = requests.map((req) => ({
      ...req,
      playerName: playersMap.get(req.playerId) ?? 'Unknown Player',
      fromDivisionName: divisionsMap.get(req.fromDivisionId) ?? req.fromDivisionId,
      toDivisionName: divisionsMap.get(req.toDivisionId) ?? req.toDivisionId,
    }));

    enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return success(enriched);
  } catch (err) {
    console.error('Error fetching all transfer requests:', err);
    return serverError('Failed to fetch transfer requests');
  }
};
