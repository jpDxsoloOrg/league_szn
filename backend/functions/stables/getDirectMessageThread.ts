import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { buildThreadKey } from '../../lib/repositories/factionMessages';
import { success, badRequest, forbidden, notFound, unauthorized, serverError } from '../../lib/response';
import { getAuthContext } from '../../lib/auth';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!auth.sub) {
      return unauthorized('Authentication required');
    }

    const factionId = event.pathParameters?.stableId;
    const partnerPlayerId = event.pathParameters?.partnerPlayerId;
    if (!factionId) {
      return badRequest('stableId is required');
    }
    if (!partnerPlayerId) {
      return badRequest('partnerPlayerId is required');
    }

    const qs = event.queryStringParameters || {};
    const cursor = qs.cursor || undefined;

    let limit = DEFAULT_LIMIT;
    if (qs.limit !== undefined && qs.limit !== null && qs.limit !== '') {
      const parsed = Number(qs.limit);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return badRequest('limit must be a positive number');
      }
      limit = Math.min(Math.floor(parsed), MAX_LIMIT);
    }

    const {
      roster: { stables: stablesRepo, players: playersRepo },
      factionDirectMessages: factionDirectMessagesRepo,
    } = getRepositories();

    const faction = await stablesRepo.findById(factionId);
    if (!faction) {
      return notFound('Faction not found');
    }

    const callerPlayer = await playersRepo.findByUserId(auth.sub);
    const callerPlayerId = callerPlayer?.playerId;
    const memberIds = faction.memberIds ?? [];
    const isMember = callerPlayerId ? memberIds.includes(callerPlayerId) : false;

    if (!isMember || !callerPlayerId) {
      return forbidden('Only faction members can read direct messages');
    }

    // Don't leak whether the partner exists at all — return a generic 404
    // for both "not a member" and "doesn't exist".
    if (!memberIds.includes(partnerPlayerId) || partnerPlayerId === callerPlayerId) {
      return notFound('Thread not found');
    }

    const threadKey = buildThreadKey(callerPlayerId, partnerPlayerId);
    const page = await factionDirectMessagesRepo.listThread(factionId, threadKey, {
      cursor,
      limit,
    });
    return success(page);
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid pagination cursor') {
      return badRequest('Invalid pagination cursor');
    }
    console.error('Error reading faction direct message thread:', err);
    return serverError('Failed to read direct message thread');
  }
};
