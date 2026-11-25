import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAuthContext } from '../../lib/auth';
import { getRepositories } from '../../lib/repositories';
import type { LedgerEntry } from '../../lib/repositories/ledger';
import { badRequest, notFound, serverError, success } from '../../lib/response';

/** A ledger entry as its player sees it: no GM id, no internal idempotency key. */
export type OwnLedgerEntry = Omit<LedgerEntry, 'actorUserId' | 'idempotencyKey'>;

export interface MyLedgerResponse {
  playerId: string;
  /** Cached ledger balance; missing on the player row means 0. */
  balance: number;
  /** Newest first. */
  items: OwnLedgerEntry[];
  /** Pass back as `?cursor=` for the next (older) page. Absent on the last page. */
  nextCursor?: string;
}

function toOwnLedgerEntry(entry: LedgerEntry): OwnLedgerEntry {
  const { actorUserId: _actorUserId, idempotencyKey: _idempotencyKey, ...rest } = entry;
  return rest;
}

/**
 * GET /players/me/ledger?cursor=&limit= (ECO-13, the signed-in player): their
 * own wallet history, newest first, with the current balance.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { sub } = getAuthContext(event);
    const { roster: { players }, ledger } = getRepositories();
    const player = sub ? await players.findByUserId(sub) : null;
    if (!player) return notFound('No player profile found for this user');

    const { cursor, limit: limitParam } = event.queryStringParameters ?? {};
    let limit: number | undefined;
    if (limitParam !== undefined) {
      limit = Number(limitParam);
      if (!Number.isInteger(limit) || limit <= 0) return badRequest('limit must be a positive whole number');
    }

    let page;
    try {
      page = await ledger.listForPlayer(player.playerId, cursor || undefined, limit);
    } catch (err) {
      if (err instanceof Error && err.message === 'Invalid pagination cursor') {
        return badRequest('Invalid pagination cursor');
      }
      throw err;
    }

    const response: MyLedgerResponse = {
      playerId: player.playerId,
      balance: player.balance ?? 0,
      items: page.items.map(toOwnLedgerEntry),
      ...(page.nextCursor && { nextCursor: page.nextCursor }),
    };
    return success(response);
  } catch (err) {
    console.error('Error fetching own ledger:', err);
    return serverError('Failed to fetch ledger');
  }
};
