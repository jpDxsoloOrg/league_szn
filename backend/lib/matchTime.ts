/**
 * When a match result happened (PRL-02).
 *
 * `completedAt` is stamped when the result is recorded; `date` is the date the
 * match was booked for. Anything asking "did this result land inside a time
 * window" should use this, so a match booked last week but recorded today
 * counts as today. Matches recorded before `completedAt` existed (and not yet
 * backfilled) fall back to `date`.
 */
export function matchResultTime(match: { completedAt?: string; date: string }): string {
  return match.completedAt ?? match.date;
}
