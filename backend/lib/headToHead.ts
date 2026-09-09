import type { Match } from './repositories/types';

export type HeadToHeadMatch = Pick<Match, 'matchId' | 'date' | 'participants' | 'winners'>;

export interface HeadToHeadRecord {
  player1Id: string;
  player2Id: string;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  totalMatches: number;
  /** Most recent shared match, when there is one. */
  lastMatchDate?: string;
  lastMatchId?: string;
  /** Winner of the most recent shared match; undefined for a draw. */
  lastWinnerId?: string;
}

export interface HeadToHeadResult<T extends HeadToHeadMatch> extends HeadToHeadRecord {
  /** Shared matches, newest first. */
  matches: T[];
}

/**
 * Record between two players across the completed matches they both took
 * part in. A match neither of them won (a draw, or a multi-man won by a
 * third wrestler) counts as a draw *between the pair*. Shared by the
 * statistics head-to-head section and the event commentary view.
 */
export function computeHeadToHead<T extends HeadToHeadMatch>(
  completedMatches: T[],
  player1Id: string,
  player2Id: string,
): HeadToHeadResult<T> {
  const shared = completedMatches
    .filter((m) => m.participants.includes(player1Id) && m.participants.includes(player2Id))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  let player1Wins = 0;
  let player2Wins = 0;
  let draws = 0;
  for (const match of shared) {
    if (match.winners?.includes(player1Id)) player1Wins++;
    else if (match.winners?.includes(player2Id)) player2Wins++;
    else draws++;
  }

  const last = shared[0];
  const lastWinnerId = last?.winners?.find((id) => id === player1Id || id === player2Id);

  return {
    player1Id,
    player2Id,
    player1Wins,
    player2Wins,
    draws,
    totalMatches: shared.length,
    lastMatchDate: last?.date,
    lastMatchId: last?.matchId,
    lastWinnerId,
    matches: shared,
  };
}

/** Every unordered pair in participant order: (0,1), (0,2), …, (n-2,n-1). */
export function pairwise<T>(items: T[]): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}
