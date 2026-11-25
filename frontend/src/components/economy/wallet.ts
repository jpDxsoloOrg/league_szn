import type { LedgerEntryKind, OwnLedgerEntry } from '../../services/api/contracts.api';

/*
 * Wallet helpers for the player's own money (ECO-13): the contract page,
 * the ledger list and the dashboard card.
 */

export const MY_CONTRACT_PATH = '/my-contract';
export const MY_WALLET_PATH = '/my-contract?tab=wallet';

/** Kinds that count as earnings for "this week". */
export const EARNING_KINDS: ReadonlySet<LedgerEntryKind> = new Set<LedgerEntryKind>(['perMatchPay', 'winBonus', 'salary']);

const SUNDAY = 0;
const DAYS_PER_WEEK = 7;
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Midnight (local time) on the Sunday that starts the league week holding
 * `now`. Matches the backend payroll week (lib/leagueWeek.ts): salary for the
 * week is posted on that Sunday.
 */
export function startOfWeek(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() - SUNDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK));
  return start;
}

/** The next payday: today when it is Sunday, otherwise the coming Sunday (local midnight). */
export function nextPayday(now: Date): Date {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  day.setDate(day.getDate() + ((SUNDAY - day.getDay() + DAYS_PER_WEEK) % DAYS_PER_WEEK));
  return day;
}

/** Pay, win bonuses and salary posted since this league week's Sunday. Entries are newest first. */
export function weekEarnings(entries: readonly OwnLedgerEntry[], now: Date): number {
  const since = startOfWeek(now).getTime();
  return entries
    .filter((entry) => EARNING_KINDS.has(entry.kind) && new Date(entry.createdAt).getTime() >= since)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

/** "$1,200", "-$40" or "+$40" with `signed`. */
export function formatMoney(amount: number, symbol: string, locale: string, signed = false): string {
  const magnitude = `${symbol}${Math.abs(amount).toLocaleString(locale)}`;
  if (amount < 0) return `-${magnitude}`;
  return signed && amount > 0 ? `+${magnitude}` : magnitude;
}

export type TimeLeft =
  | { unit: 'days'; count: number }
  | { unit: 'hours'; count: number }
  | { unit: 'expired' };

/** How long an offer stays open: whole days while a day or more is left, then hours (at least 1). */
export function timeLeft(expiresAt: string, now: Date): TimeLeft {
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  if (!(remaining > 0)) return { unit: 'expired' };
  const hours = Math.ceil(remaining / MS_PER_HOUR);
  if (hours >= 24) return { unit: 'days', count: Math.floor(hours / 24) };
  return { unit: 'hours', count: hours };
}
