import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

async function expirePendingInvitations(
  direction: 'to' | 'from',
  playerId: string
): Promise<void> {
  const { leagueOps: { matchmaking } } = getRepositories();

  const items = direction === 'to'
    ? await matchmaking.listInvitationsByToPlayer(playerId)
    : await matchmaking.listInvitationsByFromPlayer(playerId);

  const pending = items.filter((item) => item.status === 'pending');
  if (pending.length === 0) return;

  const updatedAt = new Date().toISOString();

  await Promise.all(
    pending.map((item) =>
      matchmaking.updateInvitation(item.invitationId, {
        status: 'expired',
        updatedAt,
      })
    )
  );
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can leave presence');
    }

    const { roster: { players }, leagueOps: { matchmaking } } = getRepositories();

    // Find the caller's player record via their user sub
    const callerPlayer = await players.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const playerId = callerPlayer.playerId;

    // Remove presence and queue entries (idempotent)
    await Promise.all([
      matchmaking.deletePresence(playerId),
      matchmaking.deleteQueue(playerId),
    ]);

    // Expire pending invitations in both directions
    await Promise.all([
      expirePendingInvitations('from', playerId),
      expirePendingInvitations('to', playerId),
    ]);

    return noContent();
  } catch (err) {
    console.error('Error leaving presence:', err);
    return serverError('Failed to leave presence');
  }
};
