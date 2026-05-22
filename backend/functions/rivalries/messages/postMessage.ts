import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../../../lib/repositories';
import { success, badRequest, forbidden, notFound, serverError } from '../../../lib/response';
import { getAuthContext, hasRole } from '../../../lib/auth';
import { parseBody } from '../../../lib/parseBody';
import { createRivalryNotification } from '../../../lib/notifications';
import type {
  Rivalry,
  RivalryMessage,
  RivalryMessageAudience,
} from '../../../lib/repositories';

const VALID_AUDIENCES: ReadonlyArray<RivalryMessageAudience> = ['all', 'participants', 'admins'];

interface PostBody {
  content?: string;
  body?: string;
  audience?: RivalryMessageAudience;
}

/**
 * POST /rivalries/{rivalryId}/messages
 *
 * Authed endpoint. Only rivalry participants (the two wrestlers) and
 * GMs (Admin/Moderator) may post. Audience defaults to 'participants'
 * — that's the conservative choice for the first thread primitive and
 * mirrors the convention RIV-12 uses on the audience toggle.
 *
 * Notification fan-out respects audience: 'admins'-tagged messages
 * never notify the opposing wrestler. Status changes and the system
 * messages from respondRivalry use audience='all' and continue to
 * notify normally.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const rivalryId = event.pathParameters?.rivalryId;
    if (!rivalryId) return badRequest('rivalryId is required');

    const parsed = parseBody<PostBody>(event);
    if (parsed.error) return parsed.error;
    const rawContent = (parsed.data.content ?? parsed.data.body ?? '').trim();
    if (!rawContent) return badRequest('content is required');

    const audience: RivalryMessageAudience = parsed.data.audience ?? 'participants';
    if (!VALID_AUDIENCES.includes(audience)) {
      return badRequest(`audience must be one of: ${VALID_AUDIENCES.join(', ')}`);
    }

    const auth = getAuthContext(event);
    const isGm = hasRole(auth, 'Admin', 'Moderator');
    if (!auth.sub && !isGm) return forbidden('Authentication required');

    const {
      rivalries,
      roster: { players },
      runInTransaction,
    } = getRepositories();

    const rivalry = await rivalries.get(rivalryId);
    if (!rivalry) return notFound('Rivalry not found');

    const callerPlayer = auth.sub ? await players.findByUserId(auth.sub).catch(() => null) : null;
    const callerPlayerId = callerPlayer?.playerId;
    const isParticipant =
      !!callerPlayerId && rivalry.participants.some((p) => p.playerId === callerPlayerId);

    // GMs and rivalry participants only. Non-participants get 403, not
    // 404 — the rivalry's existence is already exposed via the public
    // GET endpoint, so the standard "don't leak existence" reasoning
    // doesn't apply here.
    if (!isGm && !isParticipant) {
      return forbidden('You are not a participant in this rivalry');
    }

    // GMs posting are attributed to a system author when they're not
    // also a participant — keeps the audit trail clear in the UI.
    const authorPlayerId = callerPlayerId ?? 'system';
    const now = new Date().toISOString();
    const message: RivalryMessage = {
      rivalryId,
      messageId: uuidv4(),
      authorPlayerId,
      body: rawContent,
      audience,
      createdAt: now,
    };

    await runInTransaction(async (tx) => {
      tx.appendRivalryMessage(message);
    });

    await fanOutNotifications({
      rivalry,
      message,
      authorPlayerId,
      audience,
      players,
    });

    return success({ message });
  } catch (err) {
    console.error('Error posting rivalry message:', err);
    return serverError('Failed to post rivalry message');
  }
};

interface FanOutArgs {
  rivalry: Rivalry;
  message: RivalryMessage;
  authorPlayerId: string;
  audience: RivalryMessageAudience;
  players: ReturnType<typeof getRepositories>['roster']['players'];
}

async function fanOutNotifications({
  rivalry,
  message,
  authorPlayerId,
  audience,
  players,
}: FanOutArgs): Promise<void> {
  // 'admins' messages don't notify wrestlers. Without an authoritative
  // "assigned GMs" set on the rivalry we let the admin panel surface
  // these via the audit list rather than spam every Moderator; this
  // keeps notification volume sensible and matches the acceptance
  // criterion that opposing wrestlers never see gm-only traffic.
  if (audience === 'admins') return;

  const recipients = rivalry.participants.filter((p) => p.playerId !== authorPlayerId);
  if (recipients.length === 0) return;

  const recipientPlayers = await Promise.all(
    recipients.map((p) => players.findById(p.playerId).catch(() => null)),
  );

  const preview = message.body.length > 80 ? `${message.body.slice(0, 80)}…` : message.body;
  const notifyMessage = `New message on rivalry "${rivalry.title}": ${preview}`;

  await Promise.all(
    recipientPlayers
      .filter((p): p is NonNullable<typeof p> => !!p && !!p.userId)
      .map((p) =>
        createRivalryNotification(rivalry.rivalryId, p.userId as string, 'rivalry_message', notifyMessage),
      ),
  );
}
