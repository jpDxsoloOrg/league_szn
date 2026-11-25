/**
 * Shop purchase rules and player effects (ECO-08). Pure: no I/O.
 *
 * A purchase stores its effect; nothing here applies it. ECO-10 reads
 * `Player.effects` (injury shield, pending rehab, pending stamina top-up) and
 * `Match.simBoosts` once injuries, stamina and the match sim exist, and
 * removes or decrements each effect as it is used.
 */
import type { ShopItemKey, ShopSettings } from '../policies/economyDefaults';
import type {
  InjuryShieldEffect,
  Match,
  PlayerEffect,
  RehabEffect,
  SimBoost,
  StaminaTopUpEffect,
} from '../repositories/types';

/** Rehab needs at least this many weeks left on the active injury. */
export const REHAB_MIN_WEEKS_LEFT = 2;

/** Items bought through `POST /shop/purchase`. GM interference has its own route (ECO-09). */
export const PURCHASABLE_ITEMS = ['injuryShield', 'rehab', 'staminaTopUp', 'simInterference'] as const;
export type PurchasableItem = typeof PURCHASABLE_ITEMS[number];

export function isPurchasableItem(value: unknown): value is PurchasableItem {
  return typeof value === 'string' && (PURCHASABLE_ITEMS as readonly string[]).includes(value);
}

/** Machine-readable reason a purchase is refused, for the shop UI to translate. */
export type PurchaseRefusalCode =
  | 'ITEM_DISABLED'
  | 'IN_DEBT'
  | 'INSUFFICIENT_FUNDS'
  | 'SHIELD_ACTIVE'
  | 'NO_ACTIVE_INJURY'
  | 'INJURY_TOO_SHORT'
  | 'MATCH_NOT_SCHEDULED'
  | 'NOT_IN_MATCH'
  | 'BOOST_ALREADY_BOUGHT';

export interface PurchaseRefusal {
  code: PurchaseRefusalCode;
  message: string;
}

/**
 * Whether the item can be bought at all. A price of 0 counts as not for sale:
 * every purchase is a ledger entry, and a ledger entry cannot be zero.
 */
export function checkItemForSale(item: ShopItemKey, shop: ShopSettings): PurchaseRefusal | null {
  const settings = shop[item];
  if (!settings.enabled || settings.price <= 0) {
    return { code: 'ITEM_DISABLED', message: 'This item is not for sale right now' };
  }
  return null;
}

/** Debt lock: a negative balance can't buy anything; otherwise the price must be covered. */
export function checkFunds(balance: number, price: number): PurchaseRefusal | null {
  if (balance < 0) {
    return { code: 'IN_DEBT', message: 'You are in debt, so the shop is locked until your balance is back to zero' };
  }
  if (price > balance) {
    return { code: 'INSUFFICIENT_FUNDS', message: 'You do not have enough money for this item' };
  }
  return null;
}

/** A shield still has matches to cover. */
export function isActiveInjuryShield(effect: PlayerEffect): effect is InjuryShieldEffect {
  return effect.kind === 'injuryShield' && effect.matchesLeft > 0;
}

/** One active shield at a time. */
export function checkInjuryShield(effects: readonly PlayerEffect[] | undefined): PurchaseRefusal | null {
  if ((effects ?? []).some(isActiveInjuryShield)) {
    return { code: 'SHIELD_ACTIVE', message: 'You already have an active injury shield' };
  }
  return null;
}

/**
 * Rehab needs an active injury with at least REHAB_MIN_WEEKS_LEFT weeks to go.
 * `injuryWeeksLeft` is null when the player has no active injury.
 */
export function checkRehab(injuryWeeksLeft: number | null): PurchaseRefusal | null {
  if (injuryWeeksLeft === null || injuryWeeksLeft <= 0) {
    return { code: 'NO_ACTIVE_INJURY', message: 'Rehab needs an active injury' };
  }
  if (injuryWeeksLeft < REHAB_MIN_WEEKS_LEFT) {
    return {
      code: 'INJURY_TOO_SHORT',
      message: `Rehab needs at least ${REHAB_MIN_WEEKS_LEFT} weeks left on the injury`,
    };
  }
  return null;
}

/** Sim interference: a scheduled match the buyer is in, with no boost of theirs yet. */
export function checkSimInterference(
  match: Pick<Match, 'status' | 'participants' | 'simBoosts'>,
  playerId: string,
): PurchaseRefusal | null {
  if (match.status !== 'scheduled') {
    return { code: 'MATCH_NOT_SCHEDULED', message: 'Sim interference needs a scheduled match' };
  }
  if (!(match.participants ?? []).includes(playerId)) {
    return { code: 'NOT_IN_MATCH', message: 'You can only buy interference for a match you are in' };
  }
  if ((match.simBoosts ?? []).some((boost) => boost.playerId === playerId)) {
    return { code: 'BOOST_ALREADY_BOUGHT', message: 'You already bought interference for this match' };
  }
  return null;
}

/** What every new effect records about its purchase. */
export interface PurchaseMeta {
  effectId: string;
  purchasedAt: string;
  purchaseKey: string;
}

/** The player effect a purchase adds, from the settings at purchase time. */
export function buildPlayerEffect(
  item: Exclude<PurchasableItem, 'simInterference'>,
  shop: ShopSettings,
  meta: PurchaseMeta,
): PlayerEffect {
  switch (item) {
    case 'injuryShield': {
      const effect: InjuryShieldEffect = {
        ...meta,
        kind: 'injuryShield',
        reduction: shop.injuryShield.chanceReduction,
        matchesLeft: shop.injuryShield.matches,
      };
      return effect;
    }
    case 'rehab': {
      const effect: RehabEffect = { ...meta, kind: 'rehab', weeksOff: shop.rehab.weeksOff };
      return effect;
    }
    case 'staminaTopUp': {
      const effect: StaminaTopUpEffect = { ...meta, kind: 'staminaTopUp', amount: shop.staminaTopUp.amount };
      return effect;
    }
  }
}

export function buildSimBoost(
  playerId: string,
  shop: ShopSettings,
  meta: Omit<PurchaseMeta, 'effectId'>,
): SimBoost {
  return { playerId, boost: shop.simInterference.ratingBoost, ...meta };
}

// ── Idempotency keys ──────────────────────────────────────────────────

/** One sim boost per player per match: the key itself enforces it. */
export const simBoostPurchaseKey = (matchId: string, playerId: string): string =>
  `shop#simInterference#${matchId}#${playerId}`;

/** The refund for a sim boost; one per boost, so a retried refund never pays twice. */
export const simBoostRefundKey = (purchaseKey: string): string => `${purchaseKey}#refund`;

export const itemPurchaseKey = (item: PurchasableItem, playerId: string, requestId: string): string =>
  `shop#${item}#${playerId}#${requestId}`;
