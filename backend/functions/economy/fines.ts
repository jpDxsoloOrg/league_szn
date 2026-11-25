import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getAuthContext, requireRole } from '../../lib/auth';
import {
  FINE_REASON_MAX_LENGTH,
  FINE_REQUEST_ID_MAX_LENGTH,
  fineRescindKey,
  formatMoney,
  notifyFine,
} from '../../lib/fines';
import { createNotification } from '../../lib/notifications';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError, NotFoundError } from '../../lib/repositories/errors';
import { DuplicatePostingError, type LedgerEntry, type LedgerRef } from '../../lib/repositories/ledger';
import { badRequest, conflict, created, notFound, serverError, success } from '../../lib/response';

interface IssueFineBody {
  presetKey?: unknown;
  amount?: unknown;
  reason?: unknown;
  matchId?: unknown;
  /** Optional client-generated id; resending the same id never fines twice. */
  requestId?: unknown;
}

interface RescindFineBody {
  note?: unknown;
}

export interface FineResult {
  /** The `fine` entry (negative amount). */
  entry: LedgerEntry;
  balance: number;
  /** True when this requestId was already posted; nothing new was written. */
  alreadyApplied: boolean;
}

export interface RescindFineResult {
  /** The `fineRescinded` entry (positive amount). */
  entry: LedgerEntry;
  /** The fine it refunds. */
  fine: LedgerEntry;
  balance: number;
  /** True when this fine was already rescinded; nothing new was written. */
  alreadyApplied: boolean;
}

const optionalText = (value: unknown, max: number): string | undefined | { error: string } => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return { error: 'must be text' };
  const trimmed = value.trim();
  if (trimmed.length > max) return { error: `must be at most ${max} characters` };
  return trimmed === '' ? undefined : trimmed;
};

/**
 * POST /players/{playerId}/fines (GM). Posts one `fine` entry. The amount comes
 * from a preset in the economy settings (`presetKey`) or is custom (`amount`,
 * which needs a `reason`). The reason is shown to the player. Debt is allowed.
 */
export const issueFineHandler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { data: body, error: parseError } = parseBody<IssueFineBody>(event);
    if (parseError) return parseError;
    const { presetKey, amount, matchId, requestId } = body;

    const reason = optionalText(body.reason, FINE_REASON_MAX_LENGTH);
    if (typeof reason === 'object') return badRequest(`reason ${reason.error}`);
    if (presetKey !== undefined && amount !== undefined) {
      return badRequest('Send either presetKey or amount, not both');
    }
    if (presetKey === undefined && amount === undefined) {
      return badRequest('presetKey or amount is required');
    }
    if (matchId !== undefined && (typeof matchId !== 'string' || matchId.trim() === '')) {
      return badRequest('matchId must be a match id');
    }
    if (requestId !== undefined && (
      typeof requestId !== 'string' || requestId.trim() === '' || requestId.length > FINE_REQUEST_ID_MAX_LENGTH
    )) {
      return badRequest(`requestId must be 1-${FINE_REQUEST_ID_MAX_LENGTH} characters`);
    }

    const {
      roster: { players },
      competition: { matches },
      user: { siteConfig },
      ledger,
      runInTransaction,
    } = getRepositories();
    const settings = await siteConfig.getEconomySettings();

    let fineAmount: number;
    let note: string;
    if (presetKey !== undefined) {
      const preset = settings.finePresets.find((candidate) => candidate.key === presetKey);
      if (!preset) return badRequest('Unknown fine preset');
      if (preset.amount <= 0) return badRequest('This fine preset has no amount set');
      fineAmount = preset.amount;
      note = reason ? `${preset.label}: ${reason}` : preset.label;
    } else {
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
        return badRequest('amount must be a positive whole number');
      }
      if (!reason) return badRequest('A custom fine needs a reason');
      fineAmount = amount;
      note = reason;
    }

    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');
    let ref: LedgerRef | undefined;
    if (typeof matchId === 'string') {
      if (!(await matches.findById(matchId))) return notFound('Match not found');
      ref = { type: 'match', id: matchId };
    }

    const idempotencyKey = `fine#${playerId}#${requestId ?? uuidv4()}`;
    const actorUserId = getAuthContext(event).sub || undefined;

    try {
      await runInTransaction(async (tx) => {
        tx.postLedgerEntry({
          playerId,
          kind: 'fine',
          amount: -fineAmount,
          idempotencyKey,
          note,
          ...(ref && { ref }),
          ...(actorUserId && { actorUserId }),
        });
      });
    } catch (err) {
      if (err instanceof NotFoundError) return notFound('Player not found');
      if (err instanceof ConcurrencyError) return conflict('The balance changed while saving. Try again.');
      if (!(err instanceof DuplicatePostingError)) throw err;
      const existing = await ledger.getByIdempotencyKey(idempotencyKey);
      if (!existing) throw err;
      const current = await players.findById(playerId);
      const result: FineResult = { entry: existing, balance: current?.balance ?? 0, alreadyApplied: true };
      return success(result);
    }

    const entry = await ledger.getByIdempotencyKey(idempotencyKey);
    if (!entry) throw new Error(`Ledger entry ${idempotencyKey} missing after commit`);

    await notifyFine({
      userId: player.userId,
      entry,
      message: `You were fined ${formatMoney(fineAmount, settings.currencySymbol)}: ${note}`,
      sourceId: entry.entryId,
      sourceType: 'economy',
      currencySymbol: settings.currencySymbol,
    });

    const result: FineResult = { entry, balance: entry.balanceAfter, alreadyApplied: false };
    return created(result);
  } catch (err) {
    console.error('Error issuing fine:', err);
    return serverError('Failed to issue fine');
  }
};

/**
 * POST /fines/{entryId}/rescind (GM). Refunds a fine with one `fineRescinded`
 * entry. A fine is refunded at most once, also across the no-show undo route.
 */
export const rescindFineHandler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const entryId = event.pathParameters?.entryId;
    if (!entryId) return badRequest('Entry ID is required');

    // The body is optional here: `{ note? }` only.
    let body: RescindFineBody = {};
    if (event.body) {
      const parsed = parseBody<RescindFineBody>(event);
      if (parsed.error) return parsed.error;
      body = parsed.data;
    }
    const note = optionalText(body.note, FINE_REASON_MAX_LENGTH);
    if (typeof note === 'object') return badRequest(`note ${note.error}`);

    const { roster: { players }, user: { siteConfig }, ledger, runInTransaction } = getRepositories();
    const fine = await ledger.getByEntryId(entryId);
    if (!fine) return notFound('Fine not found');
    if (fine.kind !== 'fine') return badRequest('Only a fine can be rescinded');

    const idempotencyKey = fineRescindKey(fine.entryId);
    const actorUserId = getAuthContext(event).sub || undefined;

    const alreadyRescinded = async (): Promise<RescindFineResult | null> => {
      const existing = await ledger.getByIdempotencyKey(idempotencyKey);
      if (!existing) return null;
      const current = await players.findById(fine.playerId);
      return { entry: existing, fine, balance: current?.balance ?? 0, alreadyApplied: true };
    };

    const previous = await alreadyRescinded();
    if (previous) return success(previous);

    try {
      await runInTransaction(async (tx) => {
        tx.postLedgerEntry({
          playerId: fine.playerId,
          kind: 'fineRescinded',
          amount: -fine.amount,
          idempotencyKey,
          ref: { type: 'ledgerEntry', id: fine.entryId },
          note: note ?? 'Fine rescinded',
          ...(actorUserId && { actorUserId }),
        });
      });
    } catch (err) {
      if (err instanceof NotFoundError) return notFound('Player not found');
      if (err instanceof ConcurrencyError) return conflict('The balance changed while saving. Try again.');
      if (!(err instanceof DuplicatePostingError)) throw err;
      const raced = await alreadyRescinded();
      if (!raced) throw err;
      return success(raced);
    }

    const entry = await ledger.getByIdempotencyKey(idempotencyKey);
    if (!entry) throw new Error(`Ledger entry ${idempotencyKey} missing after commit`);

    const [player, settings] = await Promise.all([
      players.findById(fine.playerId),
      siteConfig.getEconomySettings(),
    ]);
    if (player?.userId) {
      await createNotification({
        userId: player.userId,
        type: 'fine_rescinded',
        message: `A fine of ${formatMoney(entry.amount, settings.currencySymbol)} was rescinded and refunded.`,
        sourceId: entry.entryId,
        sourceType: 'economy',
      });
    }

    const result: RescindFineResult = { entry, fine, balance: entry.balanceAfter, alreadyApplied: false };
    return created(result);
  } catch (err) {
    console.error('Error rescinding fine:', err);
    return serverError('Failed to rescind fine');
  }
};
