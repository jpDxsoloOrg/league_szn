import { APIGatewayProxyHandler } from 'aws-lambda';
import { requireRole } from '../../lib/auth';
import { getRepositories } from '../../lib/repositories';
import { clampLedgerPageSize, type LedgerPage } from '../../lib/repositories/ledger';
import { badRequest, notFound, serverError, success } from '../../lib/response';

export interface PlayerLedgerResult extends LedgerPage {
  playerId: string;
  balance: number;
}

/**
 * GET /players/{playerId}/ledger?cursor=&limit= (GM: Admin + Moderator).
 * One page of the player's ledger, newest first, with their balance. The GM
 * fines view (ECO-14) reads fines and their rescinds from here.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const query = event.queryStringParameters ?? {};
    let limit: number | undefined;
    if (query.limit !== undefined) {
      limit = Number(query.limit);
      if (!Number.isSafeInteger(limit) || limit <= 0) return badRequest('limit must be a positive whole number');
    }
    const cursor = query.cursor || undefined;

    const { roster: { players }, ledger } = getRepositories();
    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');

    let page: LedgerPage;
    try {
      page = await ledger.listForPlayer(playerId, cursor, clampLedgerPageSize(limit));
    } catch (err) {
      if (cursor !== undefined) return badRequest('Invalid pagination cursor');
      throw err;
    }

    const result: PlayerLedgerResult = { playerId, balance: player.balance ?? 0, ...page };
    return success(result);
  } catch (err) {
    console.error('Error reading player ledger:', err);
    return serverError('Failed to load the ledger');
  }
};
