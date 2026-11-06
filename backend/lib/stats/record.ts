import type { FormResult } from './recentFormAndStreak';

export interface WinLossDrawRecord {
  wins: number;
  losses: number;
  draws: number;
}

/** Tallies a W/L/D record from individual match results. */
export function tallyResults(results: ReadonlyArray<FormResult>): WinLossDrawRecord {
  const record: WinLossDrawRecord = { wins: 0, losses: 0, draws: 0 };
  for (const result of results) {
    if (result === 'W') record.wins++;
    else if (result === 'L') record.losses++;
    else record.draws++;
  }
  return record;
}

/**
 * Win percentage on the 0-100 scale, to one decimal place. Every API field
 * named winPercentage uses this scale; clients print it with a % sign.
 */
export function computeWinPercentage(wins: number, losses: number, draws: number): number {
  const total = wins + losses + draws;
  return total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
}
