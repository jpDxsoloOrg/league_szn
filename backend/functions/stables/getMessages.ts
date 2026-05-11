import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, forbidden, notFound, unauthorized, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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
      factionMessages: factionMessagesRepo,
    } = getRepositories();

    const stable = await stablesRepo.findById(factionId);
    if (!stable) {
      return notFound('Faction not found');
    }

    const isAdmin = hasRole(auth, 'Admin');
    if (!isAdmin) {
      const callerPlayer = await playersRepo.findByUserId(auth.sub);
      const callerPlayerId = callerPlayer?.playerId;
      const isMember = callerPlayerId ? stable.memberIds.includes(callerPlayerId) : false;
      if (!isMember) {
        return forbidden('Only faction members can read this channel');
      }
    }

    const page = await factionMessagesRepo.list(factionId, { cursor, limit });
    return success(page);
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid pagination cursor') {
      return badRequest('Invalid pagination cursor');
    }
    console.error('Error reading faction messages:', err);
    return serverError('Failed to read messages');
  }
};
