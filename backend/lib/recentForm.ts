import type { Match } from './repositories';

export type FormResult = 'W' | 'L' | 'D';

export function getResultForPlayer(
  playerId: string,
  match: { participants: string[]; winners?: string[]; losers?: string[]; isDraw?: boolean }
): FormResult {
  const participants = match.participants || [];
  if (!participants.includes(playerId)) return 'D';
  if (match.isDraw) return 'D';
  const winners = match.winners || [];
  const losers = match.losers || [];
  if (winners.includes(playerId)) return 'W';
  if (losers.includes(playerId)) return 'L';
  return 'D';
}

export type CompletedMatchForForm = Pick<Match, 'participants' | 'winners' | 'losers' | 'isDraw' | 'updatedAt'>;

export function computeRecentFormAndStreak(
  playerId: string,
  completedMatches: CompletedMatchForForm[]
): { recentForm: FormResult[]; currentStreak: { type: FormResult; count: number } } {
  const playerMatches = completedMatches
    .filter((m) => (m.participants || []).includes(playerId))
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt ?? 0).getTime();
      const bTime = new Date(b.updatedAt ?? 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 5);
  const recentForm: FormResult[] = playerMatches.map((m) => getResultForPlayer(playerId, m));
  if (recentForm.length === 0) {
    return { recentForm: [], currentStreak: { type: 'W', count: 0 } };
  }
  const first = recentForm[0];
  let count = 0;
  for (const r of recentForm) {
    if (r !== first) break;
    count++;
  }
  return { recentForm, currentStreak: { type: first, count } };
}
