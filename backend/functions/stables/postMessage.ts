import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, forbidden, notFound, unauthorized, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import type { FactionMessage, FactionMessageType } from '../../lib/repositories/factionMessages';

interface PostMessageBody {
  body?: string;
  messageType?: FactionMessageType;
}

const MAX_BODY_LEN = 2000;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!auth.sub) {
      return unauthorized('Authentication required');
    }

    const factionId = event.pathParameters?.stableId;
    if (!factionId) {
      return badRequest('stableId is required');
    }

    const { data, error: parseError } = parseBody<PostMessageBody>(event);
    if (parseError) return parseError;

    const rawBody = typeof data.body === 'string' ? data.body : '';
    const trimmed = rawBody.trim();
    if (trimmed.length === 0) {
      return badRequest('Message body is required');
    }
    if (trimmed.length > MAX_BODY_LEN) {
      return badRequest(`Message body must be ${MAX_BODY_LEN} characters or fewer`);
    }

    const messageType: FactionMessageType = data.messageType ?? 'user';
    if (messageType !== 'user' && messageType !== 'system') {
      return badRequest('messageType must be "user" or "system"');
    }

    const isAdmin = hasRole(auth, 'Admin');

    if (messageType === 'system' && !isAdmin) {
      return forbidden('Only admins can post system messages');
    }

    const {
      roster: { stables: stablesRepo, players: playersRepo },
      runInTransaction,
    } = getRepositories();

    const stable = await stablesRepo.findById(factionId);
    if (!stable) {
      return notFound('Faction not found');
    }

    const callerPlayer = await playersRepo.findByUserId(auth.sub);
    const callerPlayerId = callerPlayer?.playerId;
    const isMember = callerPlayerId ? stable.memberIds.includes(callerPlayerId) : false;

    if (!isMember && !isAdmin) {
      return forbidden('Only faction members can post messages');
    }

    const message: FactionMessage = {
      messageId: uuidv4(),
      factionId,
      authorPlayerId: callerPlayerId ?? auth.sub,
      body: trimmed,
      messageType,
      createdAt: new Date().toISOString(),
    };

    await runInTransaction(async (tx) => {
      tx.appendFactionMessage(message);
    });

    return created(message);
  } catch (err) {
    console.error('Error posting faction message:', err);
    return serverError('Failed to post message');
  }
};
