import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError, NotFoundError } from '../../lib/repositories/errors';
import { DuplicatePostingError, type LedgerEntry } from '../../lib/repositories/ledger';
import { badRequest, conflict, created, notFound, serverError, success } from '../../lib/response';

export const ADJUST_NOTE_MAX_LENGTH = 500;
export const ADJUST_REQUEST_ID_MAX_LENGTH = 100;

interface AdjustBody {
  amount?: unknown;
  note?: unknown;
  /** Optional client-generated id; resending the same id never posts twice. */
  requestId?: unknown;
}

export interface AdjustBalanceResult {
  entry: LedgerEntry;
  balance: number;
  /** True when this requestId was already posted; nothing new was written. */
  alreadyApplied: boolean;
}

/**
 * POST /players/{playerId}/ledger/adjust (Admin). A manual correction to a
 * player's balance: one `gmAdjust` ledger entry. The balance may go negative.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { data: body, error: parseError } = parseBody<AdjustBody>(event);
    if (parseError) return parseError;

    const { amount, note, requestId } = body;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount === 0) {
      return badRequest('amount must be a non-zero whole number');
    }
    if (typeof note !== 'string' || note.trim() === '') {
      return badRequest('note is required');
    }
    if (note.length > ADJUST_NOTE_MAX_LENGTH) {
      return badRequest(`note must be at most ${ADJUST_NOTE_MAX_LENGTH} characters`);
    }
    if (requestId !== undefined && (
      typeof requestId !== 'string' || requestId.trim() === '' || requestId.length > ADJUST_REQUEST_ID_MAX_LENGTH
    )) {
      return badRequest(`requestId must be 1-${ADJUST_REQUEST_ID_MAX_LENGTH} characters`);
    }

    const { roster: { players }, ledger, runInTransaction } = getRepositories();
    if (!(await players.findById(playerId))) return notFound('Player not found');

    const idempotencyKey = `gmAdjust#${playerId}#${requestId ?? uuidv4()}`;
    const actorUserId = getAuthContext(event).sub || undefined;

    try {
      await runInTransaction(async (tx) => {
        tx.postLedgerEntry({
          playerId,
          kind: 'gmAdjust',
          amount,
          idempotencyKey,
          note: note.trim(),
          ...(actorUserId && { actorUserId }),
        });
      });
    } catch (err) {
      if (err instanceof NotFoundError) return notFound('Player not found');
      if (err instanceof ConcurrencyError) {
        return conflict('The balance changed while saving. Try again.');
      }
      if (!(err instanceof DuplicatePostingError)) throw err;
      const existing = await ledger.getByIdempotencyKey(idempotencyKey);
      if (!existing) throw err;
      const current = await players.findById(playerId);
      const result: AdjustBalanceResult = { entry: existing, balance: current?.balance ?? 0, alreadyApplied: true };
      return success(result);
    }

    const entry = await ledger.getByIdempotencyKey(idempotencyKey);
    if (!entry) throw new Error(`Ledger entry ${idempotencyKey} missing after commit`);
    const result: AdjustBalanceResult = { entry, balance: entry.balanceAfter, alreadyApplied: false };
    return created(result);
  } catch (err) {
    console.error('Error adjusting balance:', err);
    return serverError('Failed to adjust balance');
  }
};
