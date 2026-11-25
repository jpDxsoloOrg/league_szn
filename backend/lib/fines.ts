/**
 * Fines (ECO-07): shared rules for no-show fines and GM fines.
 *
 * A fine is a negative `fine` ledger entry; rescinding it posts a positive
 * `fineRescinded` entry keyed on the fine's entryId, so a fine can be refunded
 * once no matter which route (undo no-show or rescind) gets there first.
 * Debt is allowed: a fine may take a balance below zero.
 */
import { createNotification } from './notifications';
import type { LedgerEntry } from './repositories/ledger';
import type { Match, MatchNoShow } from './repositories/types';

/** How long after a result is recorded a GM can still mark a no-show. */
export const NO_SHOW_COMPLETED_WINDOW_DAYS = 7;
export const FINE_REASON_MAX_LENGTH = 500;
export const FINE_REQUEST_ID_MAX_LENGTH = 100;

/**
 * Fine key for the `attempt`-th no-show mark (1-based) of a player on a match.
 * The first mark uses the plain key; a re-mark after an undo gets `#2`, `#3`...
 */
export function noShowFineKey(matchId: string, playerId: string, attempt: number): string {
  const base = `match#${matchId}#noshow#${playerId}`;
  return attempt <= 1 ? base : `${base}#${attempt}`;
}

/** Key of the one refund a fine can ever get. */
export function fineRescindKey(fineEntryId: string): string {
  return `fine#${fineEntryId}#rescind`;
}

/** No-show marks that have not been undone. */
export function activeNoShows(match: Pick<Match, 'noShows'>): MatchNoShow[] {
  return (match.noShows ?? []).filter((mark) => !mark.undoneAt);
}

/** The player's active mark on this match and its 1-based attempt number, or null. */
export function findActiveNoShow(
  match: Pick<Match, 'noShows'>,
  playerId: string,
): { mark: MatchNoShow; index: number; attempt: number } | null {
  const marks = match.noShows ?? [];
  let attempt = 0;
  for (let index = 0; index < marks.length; index += 1) {
    if (marks[index].playerId !== playerId) continue;
    attempt += 1;
    if (!marks[index].undoneAt) return { mark: marks[index], index, attempt };
  }
  return null;
}

/** How many times this player has been marked on this match, undone marks included. */
export function noShowAttempts(match: Pick<Match, 'noShows'>, playerId: string): number {
  return (match.noShows ?? []).filter((mark) => mark.playerId === playerId).length;
}

/**
 * Why a no-show cannot be marked on this match now, or null when it can.
 * Scheduled matches qualify, and completed ones for a few days after the result.
 */
export function noShowMarkRefusal(match: Match, now: Date = new Date()): string | null {
  if (match.status === 'scheduled') return null;
  if (match.status !== 'completed') return 'Only scheduled or just-completed matches can have a no-show';
  const resultTime = Date.parse(match.completedAt ?? match.date);
  const windowMs = NO_SHOW_COMPLETED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (Number.isNaN(resultTime) || now.getTime() - resultTime > windowMs) {
    return `No-shows can only be marked within ${NO_SHOW_COMPLETED_WINDOW_DAYS} days of the result`;
  }
  return null;
}

/** True when this entry took the balance from zero or above to below zero. */
export function wentIntoDebt(entry: Pick<LedgerEntry, 'amount' | 'balanceAfter'>): boolean {
  return entry.balanceAfter < 0 && entry.balanceAfter - entry.amount >= 0;
}

export function formatMoney(amount: number, currencySymbol: string): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${currencySymbol}${Math.abs(amount).toLocaleString('en-US')}`;
}

/**
 * Tells the player their balance just went below zero. Never throws; skipped
 * for unlinked players and for entries that did not cross zero. Any posting
 * that takes money can call it.
 */
export async function notifyIfWentIntoDebt(
  userId: string | undefined,
  entry: LedgerEntry,
  currencySymbol: string,
): Promise<void> {
  if (!userId || !wentIntoDebt(entry)) return;
  await createNotification({
    userId,
    type: 'balance_negative',
    message: `Your balance is now ${formatMoney(entry.balanceAfter, currencySymbol)}. You are in debt.`,
    sourceId: entry.entryId,
    sourceType: 'economy',
  });
}

/**
 * Tells the player about a fine, then about going into debt when this fine
 * took the balance below zero. Never throws; skipped for unlinked players.
 */
export async function notifyFine(params: {
  userId: string | undefined;
  entry: LedgerEntry;
  message: string;
  sourceId: string;
  sourceType: 'match' | 'economy';
  currencySymbol: string;
}): Promise<void> {
  const { userId, entry, message, sourceId, sourceType, currencySymbol } = params;
  if (!userId) return;
  await createNotification({ userId, type: 'fine_issued', message, sourceId, sourceType });
  await notifyIfWentIntoDebt(userId, entry, currencySymbol);
}
