import type { CommentaryHeadToHead, CommentaryMatch, WinLossDraw } from '../types/event';

/** The match a commentator most likely wants: the first one still to happen. */
export function defaultMatchIndex(matches: CommentaryMatch[]): number {
  const next = matches.findIndex((m) => m.status !== 'completed' && m.status !== 'cancelled');
  return next === -1 ? Math.max(0, matches.length - 1) : next;
}

export function formatRecord(record: WinLossDraw): string {
  return `${record.wins}-${record.losses}-${record.draws}`;
}

export interface OrientedRecord {
  wins: number;
  losses: number;
  draws: number;
  entry: CommentaryHeadToHead;
}

/** Record of `rowId` against `colId`, oriented from the row wrestler's side. */
export function recordBetween(
  headToHead: CommentaryHeadToHead[],
  rowId: string,
  colId: string,
): OrientedRecord | null {
  for (const h of headToHead) {
    if (h.player1Id === rowId && h.player2Id === colId) {
      return { wins: h.player1Wins, losses: h.player2Wins, draws: h.draws, entry: h };
    }
    if (h.player1Id === colId && h.player2Id === rowId) {
      return { wins: h.player2Wins, losses: h.player1Wins, draws: h.draws, entry: h };
    }
  }
  return null;
}
