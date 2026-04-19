import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

const PRESENCE_TTL_SECONDS = 5 * 60;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can send presence heartbeats');
    }

    const { roster: { players }, leagueOps: { matchmaking } } = getRepositories();

    // Find the caller's player record via their user sub
    const callerPlayer = await players.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const playerId = callerPlayer.playerId;
    const lastSeenAt = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + PRESENCE_TTL_SECONDS;

    await matchmaking.putPresence({ playerId, lastSeenAt, ttl });

    return success({ playerId, lastSeenAt });
  } catch (err) {
    console.error('Error recording presence heartbeat:', err);
    return serverError('Failed to record presence heartbeat');
  }
};
