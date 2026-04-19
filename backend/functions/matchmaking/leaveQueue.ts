import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { badRequest, forbidden, serverError, noContent } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can leave the matchmaking queue');
    }

    const { players, matchmaking } = getRepositories();

    // Find the caller's player record via their user sub
    const callerPlayer = await players.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const playerId = callerPlayer.playerId;

    // Idempotent delete -- does not error if the row does not exist
    await matchmaking.deleteQueue(playerId);

    return noContent();
  } catch (err) {
    console.error('Error leaving matchmaking queue:', err);
    return serverError('Failed to leave matchmaking queue');
  }
};
