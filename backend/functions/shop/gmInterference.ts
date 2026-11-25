import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError, NotFoundError } from '../../lib/repositories/errors';
import { DuplicatePostingError, type LedgerEntry } from '../../lib/repositories/ledger';
import {
  GM_INTERFERENCE_NOTE_MAX_LENGTH,
  GM_INTERFERENCE_OUTCOME_MESSAGES,
  GM_INTERFERENCE_REQUEST_MAX_LENGTH,
  gmInterferenceChargeKey,
  gmInterferenceRefundKey,
  isGmInterferenceOutcome,
  isGmInterferenceStatus,
  toPlayerGmInterferenceView,
  type GmInterferenceRequest,
  type GmInterferenceResolution,
  type PlayerGmInterferenceView,
} from '../../lib/repositories/gmInterference';
import { checkFunds, checkItemForSale } from '../../lib/economy/effects';
import { createNotification, createNotifications } from '../../lib/notifications';
import { listStaffUserIds } from '../../lib/staffUsers';
import {
  badRequest,
  conflict,
  created,
  errorWithDetails,
  forbidden,
  notFound,
  serverError,
  success,
} from '../../lib/response';

/**
 * GM interference (ECO-09): the player pays up front and asks the GM for
 * something. The GM delivers all, some or nothing and keeps the money unless
 * they pick `refunded`.
 *
 * Lifecycle: pending -> delivered | partial | taken | refunded (all final).
 * One pending request per player. Only `refunded` moves money back.
 */

export type GmInterferenceRefusalCode =
  | 'ITEM_DISABLED'
  | 'IN_DEBT'
  | 'INSUFFICIENT_FUNDS'
  | 'REQUEST_PENDING'
  | 'MATCH_NOT_SCHEDULED'
  | 'ALREADY_RESOLVED'
  | 'OWN_REQUEST';

const refuse = (code: GmInterferenceRefusalCode, message: string): APIGatewayProxyResult =>
  errorWithDetails(409, message, { code });

const NOTIFICATION_PREVIEW_LENGTH = 120;

const formatMoney = (amount: number, currencySymbol: string): string =>
  `${currencySymbol}${amount.toLocaleString('en-US')}`;

const preview = (text: string): string =>
  text.length > NOTIFICATION_PREVIEW_LENGTH ? `${text.slice(0, NOTIFICATION_PREVIEW_LENGTH - 3)}...` : text;

/** Trimmed optional note, `undefined` when absent or blank, or an error message. */
function readNote(value: unknown, field: string): { note?: string; error?: string } {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'string') return { error: `${field} must be a string` };
  const note = value.trim();
  if (note.length > GM_INTERFERENCE_NOTE_MAX_LENGTH) {
    return { error: `${field} must be at most ${GM_INTERFERENCE_NOTE_MAX_LENGTH} characters` };
  }
  return note === '' ? {} : { note };
}

async function economyEnabled(): Promise<boolean> {
  const features = await getRepositories().user.siteConfig.getFeatures();
  return features.economy === true;
}

export interface GmInterferenceRequestResult {
  request: PlayerGmInterferenceView;
  entry: LedgerEntry;
  balance: number;
}

interface RequestBody {
  request?: unknown;
  matchId?: unknown;
}

/**
 * POST /shop/gm-interference (the player themselves). Charges
 * `shop.gmInterference.price` and creates a pending request in one
 * transaction. In debt, short of money, or already waiting on a request: 409.
 */
export const requestGmInterference: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<RequestBody>(event);
    if (parseError) return parseError;

    if (typeof body.request !== 'string' || body.request.trim() === '') {
      return badRequest('request is required');
    }
    const requestText = body.request.trim();
    if (requestText.length > GM_INTERFERENCE_REQUEST_MAX_LENGTH) {
      return badRequest(`request must be at most ${GM_INTERFERENCE_REQUEST_MAX_LENGTH} characters`);
    }
    if (body.matchId !== undefined && (typeof body.matchId !== 'string' || body.matchId.trim() === '')) {
      return badRequest('matchId must be a non-empty string');
    }
    const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : undefined;

    if (!(await economyEnabled())) return forbidden('The league economy is turned off');

    const {
      user: { siteConfig },
      roster: { players },
      competition: { matches },
      gmInterference,
      ledger,
      runInTransaction,
    } = getRepositories();

    const { sub } = getAuthContext(event);
    const player = await players.findByUserId(sub);
    if (!player) return notFound('No player profile found for this user');
    const playerId = player.playerId;

    const settings = await siteConfig.getEconomySettings();
    const notForSale = checkItemForSale('gmInterference', settings.shop);
    if (notForSale) return refuse(notForSale.code as GmInterferenceRefusalCode, notForSale.message);
    const price = settings.shop.gmInterference.price;

    const shortOfFunds = checkFunds(player.balance ?? 0, price);
    if (shortOfFunds) return refuse(shortOfFunds.code as GmInterferenceRefusalCode, shortOfFunds.message);

    const previous = await gmInterference.listByPlayer(playerId);
    if (previous.some((row) => row.status === 'pending')) {
      return refuse('REQUEST_PENDING', 'You already have a request waiting on the GM');
    }

    if (matchId !== undefined) {
      const match = await matches.findByIdWithDate(matchId);
      if (!match) return notFound('Match not found');
      if (match.status !== 'scheduled') {
        return refuse('MATCH_NOT_SCHEDULED', 'Requests can only be linked to a scheduled match');
      }
    }

    // The sequence slot doubles as the lock: two requests racing for it share
    // a charge key, and the ledger lets only one through.
    const sequence = previous.reduce((highest, row) => Math.max(highest, row.sequence ?? 0), previous.length) + 1;
    const chargeKey = gmInterferenceChargeKey(playerId, sequence);
    const requestId = uuidv4();
    const now = new Date().toISOString();

    try {
      await runInTransaction(async (tx) => {
        const charge = tx.postLedgerEntry({
          playerId,
          kind: 'purchase',
          amount: -price,
          idempotencyKey: chargeKey,
          ref: { type: 'gmInterference', id: requestId },
          note: 'gmInterference',
          actorUserId: sub || undefined,
        });
        const row: GmInterferenceRequest = {
          requestId,
          playerId,
          request: requestText,
          ...(matchId !== undefined && { matchId }),
          status: 'pending',
          price,
          sequence,
          chargeEntryId: charge.entryId,
          chargeKey,
          createdAt: now,
          updatedAt: now,
        };
        tx.createGmInterferenceRequest(row);
      });
    } catch (err) {
      if (err instanceof DuplicatePostingError) {
        return refuse('REQUEST_PENDING', 'You already have a request waiting on the GM');
      }
      if (err instanceof ConcurrencyError) {
        return conflict('Your balance changed while paying. Try again.');
      }
      if (err instanceof NotFoundError) return notFound('Player not found');
      throw err;
    }

    const [stored, entry] = await Promise.all([
      gmInterference.findById(requestId),
      ledger.getByIdempotencyKey(chargeKey),
    ]);
    if (!stored || !entry) throw new Error(`GM interference ${requestId} missing after commit`);

    const staffIds = await listStaffUserIds();
    await createNotifications(
      staffIds
        .filter((staffId) => staffId !== sub)
        .map((staffId) => ({
          userId: staffId,
          type: 'gm_interference_requested' as const,
          message: `${player.name} paid ${formatMoney(price, settings.currencySymbol)} for GM interference: "${preview(requestText)}"`,
          sourceId: requestId,
          sourceType: 'economy' as const,
        })),
    );

    const result: GmInterferenceRequestResult = {
      request: toPlayerGmInterferenceView(stored),
      entry,
      balance: entry.balanceAfter,
    };
    return created(result);
  } catch (err) {
    console.error('Error requesting GM interference:', err);
    return serverError('Failed to send the request');
  }
};

/**
 * GET /shop/gm-interference (the player themselves): their own requests,
 * newest first, with outcome and public note only.
 */
export const listMyGmInterference: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { roster: { players }, gmInterference } = getRepositories();
    const { sub } = getAuthContext(event);
    const player = await players.findByUserId(sub);
    if (!player) return notFound('No player profile found for this user');
    const rows = await gmInterference.listByPlayer(player.playerId);
    return success({ requests: rows.map(toPlayerGmInterferenceView) });
  } catch (err) {
    console.error('Error listing own GM interference requests:', err);
    return serverError('Failed to load your requests');
  }
};

export type StaffGmInterferenceView = GmInterferenceRequest & { playerName?: string };

/**
 * GET /gm-interference?status= (GM: Admin + Moderator). Every request, or one
 * status, newest first, with the player's name and the private notes.
 */
export const listGmInterference: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const status = event.queryStringParameters?.status;
    if (status !== undefined && !isGmInterferenceStatus(status)) {
      return badRequest('status must be one of pending, delivered, partial, taken, refunded');
    }
    const { roster: { players }, gmInterference } = getRepositories();
    const rows = await gmInterference.list(status === undefined ? {} : { status });
    const names = new Map<string, string>();
    for (const playerId of new Set(rows.map((row) => row.playerId))) {
      const player = await players.findById(playerId);
      if (player) names.set(playerId, player.name);
    }
    const requests: StaffGmInterferenceView[] = rows.map((row) => ({
      ...row,
      ...(names.has(row.playerId) && { playerName: names.get(row.playerId) }),
    }));
    return success({ requests });
  } catch (err) {
    console.error('Error listing GM interference requests:', err);
    return serverError('Failed to load GM interference requests');
  }
};

interface ResolveBody {
  outcome?: unknown;
  publicNote?: unknown;
  privateNote?: unknown;
}

export interface ResolveGmInterferenceResult {
  request: GmInterferenceRequest;
  /** The refund entry, when the outcome is `refunded`. */
  refund?: LedgerEntry;
}

/**
 * POST /gm-interference/{requestId}/resolve (GM: Admin + Moderator).
 * `refunded` posts a `refund` of the price in the same transaction; every
 * other outcome keeps the money. A GM can't resolve their own request.
 */
export const resolveGmInterference: APIGatewayProxyHandler = async (event) => {
  try {
    const requestId = event.pathParameters?.requestId;
    if (!requestId) return badRequest('requestId is required');

    const { data: body, error: parseError } = parseBody<ResolveBody>(event);
    if (parseError) return parseError;
    if (!isGmInterferenceOutcome(body.outcome)) {
      return badRequest('outcome must be one of delivered, partial, taken, refunded');
    }
    const outcome = body.outcome;
    const publicNote = readNote(body.publicNote, 'publicNote');
    if (publicNote.error) return badRequest(publicNote.error);
    const privateNote = readNote(body.privateNote, 'privateNote');
    if (privateNote.error) return badRequest(privateNote.error);

    const {
      user: { siteConfig },
      roster: { players },
      gmInterference,
      ledger,
      runInTransaction,
    } = getRepositories();

    const existing = await gmInterference.findById(requestId);
    if (!existing) return notFound('GM interference request not found');
    if (existing.status !== 'pending') {
      return refuse('ALREADY_RESOLVED', 'This request has already been resolved');
    }

    const { sub } = getAuthContext(event);
    const player = await players.findById(existing.playerId);
    if (player?.userId && player.userId === sub) {
      return refuse('OWN_REQUEST', 'Another GM has to resolve your own request');
    }

    const refundKey = gmInterferenceRefundKey(requestId);
    try {
      await runInTransaction(async (tx) => {
        const refund = outcome === 'refunded'
          ? tx.postLedgerEntry({
            playerId: existing.playerId,
            kind: 'refund',
            amount: existing.price,
            idempotencyKey: refundKey,
            ref: { type: 'gmInterference', id: requestId },
            note: 'gmInterference refund',
            actorUserId: sub || undefined,
          })
          : undefined;
        const resolution: GmInterferenceResolution = {
          status: outcome,
          resolvedAt: new Date().toISOString(),
          resolvedBy: sub,
          ...(publicNote.note !== undefined && { publicNote: publicNote.note }),
          ...(privateNote.note !== undefined && { privateNote: privateNote.note }),
          ...(refund && { refundEntryId: refund.entryId }),
        };
        tx.resolveGmInterferenceRequest(requestId, resolution);
      });
    } catch (err) {
      if (err instanceof DuplicatePostingError || err instanceof ConcurrencyError) {
        const current = await gmInterference.findById(requestId);
        if (current && current.status !== 'pending') {
          return refuse('ALREADY_RESOLVED', 'This request has already been resolved');
        }
        return conflict('The player\'s balance changed while refunding. Try again.');
      }
      if (err instanceof NotFoundError) return notFound('The player for this request no longer exists');
      throw err;
    }

    const resolved = await gmInterference.findById(requestId);
    if (!resolved) throw new Error(`GM interference ${requestId} missing after resolve`);
    const refund = outcome === 'refunded' ? await ledger.getByIdempotencyKey(refundKey) : null;

    if (player?.userId) {
      const settings = await siteConfig.getEconomySettings();
      const outcomeLine = outcome === 'refunded'
        ? `The GM turned your request down and refunded ${formatMoney(existing.price, settings.currencySymbol)}.`
        : GM_INTERFERENCE_OUTCOME_MESSAGES[outcome];
      await createNotification({
        userId: player.userId,
        type: 'gm_interference_resolved',
        message: publicNote.note ? `${outcomeLine} GM's note: ${preview(publicNote.note)}` : outcomeLine,
        sourceId: requestId,
        sourceType: 'economy',
      });
    }

    const result: ResolveGmInterferenceResult = { request: resolved, ...(refund && { refund }) };
    return success(result);
  } catch (err) {
    console.error('Error resolving GM interference:', err);
    return serverError('Failed to resolve the request');
  }
};
