export type FormResult = 'W' | 'L' | 'D';

export interface FormAndStreak {
  recentForm: FormResult[];
  currentStreak: { type: FormResult; count: number };
}

/**
 * Computes a recent-form window and the current win/loss/draw streak.
 *
 * The input MUST be sorted newest-first. The streak is computed over the
 * full input — not just the form window — so a 12-game win streak is still
 * surfaced even when the form window is 5.
 */
export function computeRecentFormAndStreak(
  resultsSortedNewestFirst: ReadonlyArray<FormResult>,
  limit: number,
): FormAndStreak {
  const recentForm = resultsSortedNewestFirst.slice(0, limit);

  if (resultsSortedNewestFirst.length === 0) {
    return { recentForm: [], currentStreak: { type: 'W', count: 0 } };
  }

  const first = resultsSortedNewestFirst[0];
  let count = 0;
  for (const r of resultsSortedNewestFirst) {
    if (r !== first) break;
    count++;
  }

  return { recentForm: [...recentForm], currentStreak: { type: first, count } };
}
