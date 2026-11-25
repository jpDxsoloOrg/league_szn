import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError, NotFoundError } from '../../lib/repositories/errors';
import { DuplicatePostingError, type LedgerEntry } from '../../lib/repositories/ledger';
import type { Match, PlayerEffect, SimBoost } from '../../lib/repositories/types';
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
import {
  buildPlayerEffect,
  buildSimBoost,
  checkFunds,
  checkInjuryShield,
  checkItemForSale,
  checkRehab,
  checkSimInterference,
  isPurchasableItem,
  itemPurchaseKey,
  simBoostPurchaseKey,
  type PurchasableItem,
  type PurchaseRefusal,
} from '../../lib/economy/effects';

export const PURCHASE_REQUEST_ID_MAX_LENGTH = 100;

interface PurchaseBody {
  item?: unknown;
  /** simInterference: the matchId to interfere in. */
  target?: unknown;
  /** Optional client-generated id; resending the same id never charges twice. */
  requestId?: unknown;
}

export interface PurchaseResult {
  item: PurchasableItem;
  entry: LedgerEntry;
  balance: number;
  /** The player effect this purchase added (every item but simInterference). */
  effect?: PlayerEffect;
  /** simInterference: the boost stored on the match. */
  simBoost?: SimBoost & { matchId: string };
  /** True when this requestId was already bought; nothing new was charged. */
  alreadyApplied: boolean;
}

const refuse = (refusal: PurchaseRefusal) => errorWithDetails(409, refusal.message, { code: refusal.code });

/**
 * Weeks left on the player's active injury, or null when they have none.
 * Injuries are not tracked yet (INJ, Sprint 8), so nobody has one and rehab
 * is refused until they are.
 */
function activeInjuryWeeksLeft(): number | null {
  return null;
}

/**
 * POST /shop/purchase (the player themselves). Charges the item's price as a
 * `purchase` ledger entry and records its effect in the same transaction:
 * injuryShield / rehab / staminaTopUp on `Player.effects`, simInterference on
 * `Match.simBoosts`. Applying the effects is ECO-10. A player in debt or short
 * of money can't buy (409). GM interference has its own route (ECO-09).
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<PurchaseBody>(event);
    if (parseError) return parseError;

    const { item, target, requestId } = body;
    if (item === 'gmInterference') {
      return badRequest('GM interference is requested at POST /shop/gm-interference');
    }
    if (!isPurchasableItem(item)) return badRequest('item must be one of the shop items');
    if (requestId !== undefined && (
      typeof requestId !== 'string' || requestId.trim() === '' || requestId.length > PURCHASE_REQUEST_ID_MAX_LENGTH
    )) {
      return badRequest(`requestId must be 1-${PURCHASE_REQUEST_ID_MAX_LENGTH} characters`);
    }
    if (item === 'simInterference') {
      if (typeof target !== 'string' || target.trim() === '') {
        return badRequest('target (a matchId) is required for sim interference');
      }
    } else if (target !== undefined) {
      return badRequest('target is only used for sim interference');
    }

    const {
      user: { siteConfig },
      roster: { players },
      competition: { matches },
      ledger,
      runInTransaction,
    } = getRepositories();

    const features = await siteConfig.getFeatures();
    if (!features.economy) return forbidden('The league economy is turned off');

    const { sub } = getAuthContext(event);
    const player = await players.findByUserId(sub);
    if (!player) return notFound('No player profile found for this user');
    const playerId = player.playerId;

    const idempotencyKey = item === 'simInterference'
      ? simBoostPurchaseKey(target as string, playerId)
      : itemPurchaseKey(item, playerId, typeof requestId === 'string' ? requestId : uuidv4());

    // A resent requestId returns what it bought, even if the price changed since.
    if (item !== 'simInterference' && requestId !== undefined) {
      const existing = await ledger.getByIdempotencyKey(idempotencyKey);
      if (existing) return success(await alreadyApplied(item, existing));
    }

    const { shop } = await siteConfig.getEconomySettings();
    const notForSale = checkItemForSale(item, shop);
    if (notForSale) return refuse(notForSale);
    const price = shop[item].price;

    const balance = player.balance ?? 0;
    const shortOfFunds = checkFunds(balance, price);
    if (shortOfFunds) return refuse(shortOfFunds);

    const purchasedAt = new Date().toISOString();
    const meta = { purchasedAt, purchaseKey: idempotencyKey };
    let effect: PlayerEffect | undefined;
    let boostMatch: Match | undefined;
    let simBoost: SimBoost | undefined;

    if (item === 'simInterference') {
      const match = await matches.findByIdWithDate(target as string);
      if (!match) return notFound('Match not found');
      const refusal = checkSimInterference(match, playerId);
      if (refusal) return refuse(refusal);
      boostMatch = match;
      simBoost = buildSimBoost(playerId, shop, meta);
    } else {
      if (item === 'injuryShield') {
        const refusal = checkInjuryShield(player.effects);
        if (refusal) return refuse(refusal);
      }
      if (item === 'rehab') {
        const refusal = checkRehab(activeInjuryWeeksLeft());
        if (refusal) return refuse(refusal);
      }
      effect = buildPlayerEffect(item, shop, { ...meta, effectId: uuidv4() });
    }

    try {
      await runInTransaction(async (tx) => {
        tx.postLedgerEntry({
          playerId,
          kind: 'purchase',
          amount: -price,
          idempotencyKey,
          ref: boostMatch ? { type: 'match', id: boostMatch.matchId } : { type: 'shop', id: item },
          note: item,
          actorUserId: sub || undefined,
          ...(effect && { appendPlayerEffects: [effect] }),
        });
        if (boostMatch && simBoost) {
          // Guarded on the match as read: still scheduled, no boost added since.
          tx.updateMatch(
            boostMatch.matchId,
            boostMatch.date,
            { simBoosts: [...(boostMatch.simBoosts ?? []), simBoost] },
            { kind: 'unchangedSince', updatedAt: boostMatch.updatedAt },
          );
        }
      });
    } catch (err) {
      if (err instanceof DuplicatePostingError) {
        if (item === 'simInterference') {
          return refuse({ code: 'BOOST_ALREADY_BOUGHT', message: 'You already bought interference for this match' });
        }
        const existing = await ledger.getByIdempotencyKey(idempotencyKey);
        if (!existing) throw err;
        return success(await alreadyApplied(item, existing));
      }
      if (err instanceof ConcurrencyError) {
        return conflict('Your balance or the match changed while buying. Try again.');
      }
      if (err instanceof NotFoundError) return notFound('Player not found');
      throw err;
    }

    const entry = await ledger.getByIdempotencyKey(idempotencyKey);
    if (!entry) throw new Error(`Ledger entry ${idempotencyKey} missing after commit`);
    const result: PurchaseResult = {
      item,
      entry,
      balance: entry.balanceAfter,
      ...(effect && { effect }),
      ...(boostMatch && simBoost && { simBoost: { ...simBoost, matchId: boostMatch.matchId } }),
      alreadyApplied: false,
    };
    return created(result);
  } catch (err) {
    console.error('Error buying shop item:', err);
    return serverError('Failed to complete the purchase');
  }
};

/** The answer to a resent requestId: the original entry and the effect it bought. */
async function alreadyApplied(item: PurchasableItem, entry: LedgerEntry): Promise<PurchaseResult> {
  const current = await getRepositories().roster.players.findById(entry.playerId);
  const effect = current?.effects?.find((candidate) => candidate.purchaseKey === entry.idempotencyKey);
  return {
    item,
    entry,
    balance: current?.balance ?? 0,
    ...(effect && { effect }),
    alreadyApplied: true,
  };
}
