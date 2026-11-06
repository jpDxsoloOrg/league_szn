const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const UNKNOWN_REVIEWER = 'League Staff';

/** True when a stored person label is a raw Cognito id rather than a name. */
export function isCognitoId(value: string | undefined): boolean {
  return !!value && UUID_PATTERN.test(value);
}

const EMBEDDED_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Older rivalry system messages name the moderator by Cognito id in their body
 * ("Rivalry approved by <id>."). Member-written messages are left untouched.
 */
export function maskSystemMessageIds<T extends { authorPlayerId: string; body: string }>(message: T): T {
  if (message.authorPlayerId !== 'system') return message;
  return { ...message, body: message.body.replace(EMBEDDED_UUID_PATTERN, UNKNOWN_REVIEWER) };
}

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
