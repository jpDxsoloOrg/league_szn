/**
 * Shop rules the UI checks before a request (ECO-14). The server checks the
 * same rules again (ECO-08, ECO-09); these only grey items out with a reason.
 */
import type { Match } from '../../types';
import type { ShopItemKey } from '../../services/api/economy.api';
import type { PlayerEffect, ShopRefusalCode } from '../../services/api/shop.api';

/**
 * Items whose effect needs injuries, stamina or the match sim (ECO-10, Sprint 8).
 * They are listed as "coming soon" and can't be bought yet. ECO-10 empties this set.
 */
export const PENDING_EFFECT_ITEMS: ReadonlySet<ShopItemKey> = new Set<ShopItemKey>([
  'injuryShield',
  'rehab',
  'staminaTopUp',
  'simInterference',
]);

export type ShopBlockReason =
  | 'comingSoon'
  | 'inDebt'
  | 'insufficientFunds'
  | 'shieldActive'
  | 'noActiveInjury'
  | 'noScheduledMatch'
  | 'requestPending';

export interface ShopContext {
  balance: number;
  price: number;
  effects: readonly PlayerEffect[];
  /** Scheduled matches the player is in and has not boosted yet. */
  boostableMatchCount: number;
  /** The player already waits on a GM interference request. */
  hasPendingRequest: boolean;
  /** Weeks left on the active injury; null with no injury (always null until injuries exist). */
  injuryWeeksLeft: number | null;
  pendingItems?: ReadonlySet<ShopItemKey>;
}

export function hasActiveShield(effects: readonly PlayerEffect[]): boolean {
  return effects.some((effect) => effect.kind === 'injuryShield' && effect.matchesLeft > 0);
}

/** Why the item can't be bought right now, or null when it can. */
export function shopBlockReason(item: ShopItemKey, context: ShopContext): ShopBlockReason | null {
  const pending = context.pendingItems ?? PENDING_EFFECT_ITEMS;
  if (pending.has(item)) return 'comingSoon';
  if (context.balance < 0) return 'inDebt';
  if (context.price > context.balance) return 'insufficientFunds';
  switch (item) {
    case 'injuryShield':
      return hasActiveShield(context.effects) ? 'shieldActive' : null;
    case 'rehab':
      return context.injuryWeeksLeft === null || context.injuryWeeksLeft <= 0 ? 'noActiveInjury' : null;
    case 'simInterference':
      return context.boostableMatchCount === 0 ? 'noScheduledMatch' : null;
    case 'gmInterference':
      return context.hasPendingRequest ? 'requestPending' : null;
    default:
      return null;
  }
}

/** Scheduled matches the player is in without a sim boost of theirs, soonest first. */
export function boostableMatches(matches: readonly Match[], playerId: string): Match[] {
  return matches
    .filter((match) => match.status === 'scheduled'
      && match.participants.includes(playerId)
      && !(match.simBoosts ?? []).some((boost) => boost.playerId === playerId))
    .sort((first, second) => first.date.localeCompare(second.date));
}

/** i18n key for a server refusal code, under `economyShop.refusals`. */
export function refusalKey(code: ShopRefusalCode): string {
  return `economyShop.refusals.${code}`;
}

/** `$1,200` / `-$50`, with the league's currency symbol. */
export function formatMoney(amount: number, symbol: string, locale?: string): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${symbol}${Math.abs(amount).toLocaleString(locale)}`;
}
