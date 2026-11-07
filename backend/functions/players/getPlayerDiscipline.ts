import { APIGatewayProxyHandler } from 'aws-lambda';
import { requireRole } from '../../lib/auth';
import { computeDiscipline, isDeactivated, nextStrikeOutcome } from '../../lib/discipline';
import {
  getHoldings,
  readAccountView,
  withReadableActors,
  type PlayerDisciplineDetail,
} from '../../lib/disciplineActions';
import { getRepositories } from '../../lib/repositories';
import { badRequest, notFound, serverError, success } from '../../lib/response';

/** GET /players/{playerId}/discipline: full status and history for staff. */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const player = await getRepositories().roster.players.findById(playerId);
    if (!player) return notFound('Player not found');

    const now = new Date();
    const [account, holdings, history] = await Promise.all([
      readAccountView(player.userId),
      getHoldings(playerId),
      withReadableActors(player.strikes ?? [], player.deactivations ?? []),
    ]);

    const detail: PlayerDisciplineDetail = {
      playerId,
      version: player.disciplineVersion ?? 0,
      summary: computeDiscipline(player, now),
      nextStrikeOutcome: isDeactivated(player) ? null : nextStrikeOutcome(player, now),
      strikes: history.strikes.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
      deactivations: history.deactivations.sort((a, b) => b.deactivatedAt.localeCompare(a.deactivatedAt)),
      ...account,
      holdings,
    };
    return success(detail);
  } catch (err) {
    console.error('Error reading player discipline:', err);
    return serverError('Failed to read player discipline');
  }
};
