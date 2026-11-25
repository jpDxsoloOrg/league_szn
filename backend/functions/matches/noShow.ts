import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAuthContext, requireRole } from '../../lib/auth';
import {
  FINE_REASON_MAX_LENGTH,
  findActiveNoShow,
  fineRescindKey,
  formatMoney,
  noShowAttempts,
  noShowFineKey,
  noShowMarkRefusal,
  notifyIfWentIntoDebt,
} from '../../lib/fines';
import { createNotification } from '../../lib/notifications';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError, NotFoundError } from '../../lib/repositories/errors';
import { DuplicatePostingError, type LedgerEntry } from '../../lib/repositories/ledger';
import type { Match, MatchNoShow } from '../../lib/repositories/types';
import { badRequest, conflict, created, notFound, serverError, success } from '../../lib/response';

interface MarkNoShowBody {
  playerId?: unknown;
  note?: unknown;
}

export interface NoShowResult {
  matchId: string;
  playerId: string;
  noShow: MatchNoShow;
  /** The no-show fine (`mark`) or its refund (`undo`); null when nothing was posted. */
  entry: LedgerEntry | null;
  /** The player's balance after this request. */
  balance: number;
  /** Mark only: true when the player was already marked; nothing new was written. */
  alreadyApplied: boolean;
}

const RETRY_CONFLICT = 'The match or balance changed while saving. Try again.';

async function currentBalance(playerId: string): Promise<number> {
  const player = await getRepositories().roster.players.findById(playerId);
  return player?.balance ?? 0;
}

async function alreadyMarkedResult(match: Match, playerId: string): Promise<NoShowResult | null> {
  const active = findActiveNoShow(match, playerId);
  if (!active) return null;
  const { ledger } = getRepositories();
  const fine = await ledger.getByIdempotencyKey(noShowFineKey(match.matchId, playerId, active.attempt));
  return {
    matchId: match.matchId,
    playerId,
    noShow: active.mark,
    entry: fine,
    balance: await currentBalance(playerId),
    alreadyApplied: true,
  };
}

/**
 * POST /matches/{matchId}/no-show (GM). Marks a participant of a scheduled or
 * just-completed match as a no-show, fines them the `noShowFine` from the
 * economy settings and tells them. The match itself is left alone: the GM
 * reschedules it or records the result as usual. Marking twice fines once.
 */
export const markNoShowHandler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const matchId = event.pathParameters?.matchId;
    if (!matchId) return badRequest('matchId is required');

    const { data: body, error: parseError } = parseBody<MarkNoShowBody>(event);
    if (parseError) return parseError;
    const { playerId } = body;
    if (typeof playerId !== 'string' || playerId.trim() === '') return badRequest('playerId is required');
    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
      return badRequest('note must be text');
    }
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > FINE_REASON_MAX_LENGTH) {
      return badRequest(`note must be at most ${FINE_REASON_MAX_LENGTH} characters`);
    }

    const {
      competition: { matches },
      roster: { players },
      user: { siteConfig },
      ledger,
      runInTransaction,
    } = getRepositories();

    const match = await matches.findByIdWithDate(matchId);
    if (!match) return notFound('Match not found');
    if (!match.participants.includes(playerId)) return badRequest('That player is not in this match');

    const previous = await alreadyMarkedResult(match, playerId);
    if (previous) return success(previous);

    const refusal = noShowMarkRefusal(match);
    if (refusal) return conflict(refusal);

    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');

    const settings = await siteConfig.getEconomySettings();
    const fineAmount = settings.noShowFine;
    const fineKey = noShowFineKey(matchId, playerId, noShowAttempts(match, playerId) + 1);
    const mark: MatchNoShow = { playerId, markedAt: new Date().toISOString() };
    const actorUserId = getAuthContext(event).sub || undefined;

    try {
      await runInTransaction(async (tx) => {
        tx.updateMatch(
          matchId,
          match.date,
          { noShows: [...(match.noShows ?? []), mark] },
          { kind: 'unchangedSince', updatedAt: match.updatedAt },
        );
        if (fineAmount > 0) {
          tx.postLedgerEntry({
            playerId,
            kind: 'fine',
            amount: -fineAmount,
            idempotencyKey: fineKey,
            ref: { type: 'match', id: matchId },
            note: note ? `No-show: ${note}` : 'No-show',
            ...(actorUserId && { actorUserId }),
          });
        }
      });
    } catch (err) {
      if (err instanceof NotFoundError) return notFound('Player not found');
      if (err instanceof ConcurrencyError || err instanceof DuplicatePostingError) {
        // Someone else marked this player at the same moment: report their mark.
        const latest = await matches.findByIdWithDate(matchId);
        const raced = latest ? await alreadyMarkedResult(latest, playerId) : null;
        if (raced) return success(raced);
        if (err instanceof ConcurrencyError) return conflict(RETRY_CONFLICT);
      }
      throw err;
    }

    const entry = fineAmount > 0 ? await ledger.getByIdempotencyKey(fineKey) : null;
    if (fineAmount > 0 && !entry) throw new Error(`Ledger entry ${fineKey} missing after commit`);

    if (player.userId) {
      const fined = entry ? ` and fined ${formatMoney(fineAmount, settings.currencySymbol)}` : '';
      await createNotification({
        userId: player.userId,
        type: 'no_show_marked',
        message: `You were marked as a no-show for a match${fined}.`,
        sourceId: matchId,
        sourceType: 'match',
      });
      if (entry) await notifyIfWentIntoDebt(player.userId, entry, settings.currencySymbol);
    }

    const result: NoShowResult = {
      matchId,
      playerId,
      noShow: mark,
      entry,
      balance: entry ? entry.balanceAfter : player.balance ?? 0,
      alreadyApplied: false,
    };
    return created(result);
  } catch (err) {
    console.error('Error marking no-show:', err);
    return serverError('Failed to mark no-show');
  }
};

/**
 * DELETE /matches/{matchId}/no-show/{playerId} (GM). Undoes the player's
 * active no-show mark and refunds its fine with a `fineRescinded` entry,
 * unless that fine was already rescinded on its own.
 */
export const undoNoShowHandler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const matchId = event.pathParameters?.matchId;
    const playerId = event.pathParameters?.playerId;
    if (!matchId) return badRequest('matchId is required');
    if (!playerId) return badRequest('playerId is required');

    const {
      competition: { matches },
      roster: { players },
      user: { siteConfig },
      ledger,
      runInTransaction,
    } = getRepositories();

    const match = await matches.findByIdWithDate(matchId);
    if (!match) return notFound('Match not found');
    const active = findActiveNoShow(match, playerId);
    if (!active) return notFound('This player is not marked as a no-show on this match');

    const fine = await ledger.getByIdempotencyKey(noShowFineKey(matchId, playerId, active.attempt));
    const refundKey = fine ? fineRescindKey(fine.entryId) : null;
    const refundNeeded = fine !== null && refundKey !== null
      && (await ledger.getByIdempotencyKey(refundKey)) === null;

    const undone: MatchNoShow = { ...active.mark, undoneAt: new Date().toISOString() };
    const noShows = (match.noShows ?? []).map((mark, index) => (index === active.index ? undone : mark));
    const actorUserId = getAuthContext(event).sub || undefined;

    const writeUndo = (withRefund: boolean) => runInTransaction(async (tx) => {
      tx.updateMatch(matchId, match.date, { noShows }, { kind: 'unchangedSince', updatedAt: match.updatedAt });
      if (withRefund && fine && refundKey) {
        tx.postLedgerEntry({
          playerId,
          kind: 'fineRescinded',
          amount: -fine.amount,
          idempotencyKey: refundKey,
          ref: { type: 'ledgerEntry', id: fine.entryId },
          note: 'No-show undone',
          ...(actorUserId && { actorUserId }),
        });
      }
    });

    let refunded = refundNeeded;
    try {
      try {
        await writeUndo(refundNeeded);
      } catch (err) {
        // The fine was rescinded on its own in the meantime: just clear the mark.
        if (!(err instanceof DuplicatePostingError)) throw err;
        refunded = false;
        await writeUndo(false);
      }
    } catch (err) {
      if (err instanceof NotFoundError) return notFound('Player not found');
      if (err instanceof ConcurrencyError) return conflict(RETRY_CONFLICT);
      throw err;
    }

    const entry = refunded && refundKey ? await ledger.getByIdempotencyKey(refundKey) : null;
    if (entry) {
      const [player, settings] = await Promise.all([players.findById(playerId), siteConfig.getEconomySettings()]);
      if (player?.userId) {
        await createNotification({
          userId: player.userId,
          type: 'fine_rescinded',
          message: `Your no-show was undone and ${formatMoney(entry.amount, settings.currencySymbol)} was refunded.`,
          sourceId: matchId,
          sourceType: 'match',
        });
      }
    }

    const result: NoShowResult = {
      matchId,
      playerId,
      noShow: undone,
      entry,
      balance: entry ? entry.balanceAfter : await currentBalance(playerId),
      alreadyApplied: false,
    };
    return success(result);
  } catch (err) {
    console.error('Error undoing no-show:', err);
    return serverError('Failed to undo no-show');
  }
};
