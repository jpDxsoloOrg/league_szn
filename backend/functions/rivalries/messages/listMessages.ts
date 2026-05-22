import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../../lib/repositories';
import { success, badRequest, forbidden, notFound, serverError } from '../../../lib/response';
import { getAuthContext, hasRole } from '../../../lib/auth';
import type { RivalryMessage, RivalryMessageAudience } from '../../../lib/repositories';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/**
 * GET /rivalries/{rivalryId}/messages
 *
 * Authed list. Only participants and GMs may read — non-participants
 * get 403, not 404 (the rivalry's existence is already public via the
 * detail endpoint). Returned messages are filtered by per-message
 * audience: a wrestler never sees admins-only messages from the
 * opposing side, GMs see everything.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const rivalryId = event.pathParameters?.rivalryId;
    if (!rivalryId) return badRequest('rivalryId is required');

    const qp = event.queryStringParameters || {};
    const limit = parseLimit(qp.limit ?? undefined);
    const cursor = qp.cursor || undefined;

    const auth = getAuthContext(event);
    const isGm = hasRole(auth, 'Admin', 'Moderator');

    const {
      rivalries,
      rivalryMessages,
      roster: { players },
    } = getRepositories();

    const rivalry = await rivalries.get(rivalryId);
    if (!rivalry) return notFound('Rivalry not found');

    const callerPlayer = auth.sub ? await players.findByUserId(auth.sub).catch(() => null) : null;
    const callerPlayerId = callerPlayer?.playerId;
    const isParticipant =
      !!callerPlayerId && rivalry.participants.some((p) => p.playerId === callerPlayerId);

    if (!isGm && !isParticipant) {
      return forbidden('You are not a participant in this rivalry');
    }

    const allowed = computeAllowedAudience(isGm, isParticipant);
    const page = await rivalryMessages.list(rivalryId, { limit, cursor });

    // A wrestler must not see admins-only messages authored by the
    // opposing wrestler. They can still see their own admins-only
    // messages because the author is always allowed to see what they
    // sent (the sent-confirmation convention from the ticket).
    const filtered = page.items.filter((m: RivalryMessage) =>
      isVisible(m, { isGm, callerPlayerId, allowed }),
    );

    return success({
      messages: filtered,
      nextCursor: page.nextCursor ?? null,
    });
  } catch (err) {
    console.error('Error listing rivalry messages:', err);
    return serverError('Failed to list rivalry messages');
  }
};

function computeAllowedAudience(
  isGm: boolean,
  isParticipant: boolean,
): Set<RivalryMessageAudience> {
  if (isGm) return new Set(['all', 'participants', 'admins']);
  if (isParticipant) return new Set(['all', 'participants']);
  return new Set(['all']);
}

interface VisibleArgs {
  isGm: boolean;
  callerPlayerId: string | undefined;
  allowed: Set<RivalryMessageAudience>;
}

function isVisible(message: RivalryMessage, args: VisibleArgs): boolean {
  if (args.allowed.has(message.audience)) return true;
  // Authors always see their own messages, even when posted to an
  // audience tier their role wouldn't normally surface.
  if (args.callerPlayerId && message.authorPlayerId === args.callerPlayerId) return true;
  return false;
}
