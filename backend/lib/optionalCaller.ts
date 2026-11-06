import type { APIGatewayProxyEvent } from 'aws-lambda';
import { authenticate } from './authenticate';
import { getAuthContext, hasRole, type AuthContext } from './auth';

/**
 * Identify the caller on a public route, which has no gateway authorizer.
 * Returns null for anonymous callers and for any token that fails
 * verification, so public endpoints keep serving the public view.
 */
export async function getVerifiedCaller(event: APIGatewayProxyEvent): Promise<AuthContext | null> {
  if (!event.headers?.Authorization && !event.headers?.authorization) return null;
  const result = await authenticate(event).catch(() => ({ ok: false as const }));
  return result.ok ? getAuthContext(event) : null;
}

/** True for a verified Admin or Moderator. */
export function isStaff(caller: AuthContext | null): boolean {
  return caller !== null && hasRole(caller, 'Admin', 'Moderator');
}

/** A hidden player can be read only by that player or by staff. */
export async function canViewHiddenPlayer(
  event: APIGatewayProxyEvent,
  player: { userId?: string },
): Promise<boolean> {
  const caller = await getVerifiedCaller(event);
  if (!caller) return false;
  return isStaff(caller) || (Boolean(caller.sub) && caller.sub === player.userId);
}
