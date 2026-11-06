import type { Match } from './repositories/types';

type MatchOutcome = Pick<Match, 'winners' | 'isDraw'>;

/**
 * The players who actually won a match. A draw stores every participant in
 * `winners` because recordResult, deleteMatch and revertGroupStats use it as
 * the draw's participant list, so any read that derives a result must go
 * through this instead of reading `winners` directly.
 */
export function matchWinners(match: MatchOutcome): string[] {
  return match.isDraw ? [] : match.winners ?? [];
}
