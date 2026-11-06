const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const UNKNOWN_REVIEWER = 'League Staff';

/**
 * Reviews store the reviewer's Cognito id, which is not fit to display.
 * Returns a lookup that gives the linked player's name, keeps an older
 * readable username, and otherwise falls back to a generic label.
 */
export function createReviewerNameLookup(
  players: ReadonlyArray<{ userId?: string; name: string }>,
): (reviewedBy: string | undefined) => string | undefined {
  const namesByUserId = new Map<string, string>();
  for (const { userId, name } of players) {
    if (userId && name) namesByUserId.set(userId, name);
  }
  return (reviewedBy) => {
    if (!reviewedBy) return undefined;
    const name = namesByUserId.get(reviewedBy);
    if (name) return name;
    return UUID_PATTERN.test(reviewedBy) ? UNKNOWN_REVIEWER : reviewedBy;
  };
}
