import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../../lib/repositories';
import { buildThreadKey } from '../../lib/repositories/factionMessages';
import { created, badRequest, notFound, unauthorized, serverError } from '../../lib/response';
import { getAuthContext } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import type { FactionDirectMessage } from '../../lib/repositories/factionMessages';

interface PostDirectMessageBody {
  recipientPlayerId?: string;
  body?: string;
}

const MAX_BODY_LEN = 2000;

const notBothMembers = (): APIGatewayProxyResult => ({
  statusCode: 403,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://leagueszn.jpdxsolo.com',
    'Access-Control-Allow-Credentials': true,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  } as Record<string, string | boolean | number>,
  body: JSON.stringify({
    message: 'Both participants must be active members of this faction',
    errorKey: 'not_both_members',
  }),
});

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

    const { data, error: parseError } = parseBody<PostDirectMessageBody>(event);
    if (parseError) return parseError;

    const recipientPlayerId =
      typeof data.recipientPlayerId === 'string' ? data.recipientPlayerId.trim() : '';
    if (!recipientPlayerId) {
      return badRequest('recipientPlayerId is required');
    }

    const rawBody = typeof data.body === 'string' ? data.body : '';
    const trimmed = rawBody.trim();
    if (trimmed.length === 0) {
      return badRequest('Message body is required');
    }
    if (trimmed.length > MAX_BODY_LEN) {
      return badRequest(`Message body must be ${MAX_BODY_LEN} characters or fewer`);
    }

    const {
      roster: { stables: stablesRepo, players: playersRepo },
      runInTransaction,
    } = getRepositories();

    const callerPlayer = await playersRepo.findByUserId(auth.sub);
    if (!callerPlayer) {
      return notBothMembers();
    }

    if (recipientPlayerId === callerPlayer.playerId) {
      return badRequest('Cannot send a direct message to yourself');
    }

    const faction = await stablesRepo.findById(factionId);
    if (!faction) {
      return notFound('Faction not found');
    }

    const memberIds = faction.memberIds ?? [];
    if (!memberIds.includes(callerPlayer.playerId) || !memberIds.includes(recipientPlayerId)) {
      return notBothMembers();
    }

    const threadKey = buildThreadKey(callerPlayer.playerId, recipientPlayerId);

    const message: FactionDirectMessage = {
      messageId: uuidv4(),
      factionId,
      threadKey,
      senderPlayerId: callerPlayer.playerId,
      recipientPlayerId,
      body: trimmed,
      createdAt: new Date().toISOString(),
    };

    await runInTransaction(async (tx) => {
      tx.appendFactionDirectMessage(message);
    });

    return created(message);
  } catch (err) {
    console.error('Error posting faction direct message:', err);
    return serverError('Failed to post direct message');
  }
};
