import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, forbidden, notFound, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can view invitations');
    }

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const { roster: { stables: stablesRepo, players: playersRepo } } = getRepositories();

    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    // Invitations carry private messages: only the stable's own members and staff may read them.
    if (!hasRole(auth, 'Admin', 'Moderator')) {
      const callerPlayer = await playersRepo.findByUserId(auth.sub);
      if (!callerPlayer) {
        return badRequest('Player not found');
      }
      const isMember = stable.leaderId === callerPlayer.playerId
        || stable.memberIds.includes(callerPlayer.playerId);
      if (!isMember) {
        return forbidden('Only members of this stable can view its invitations');
      }
    }

    // Query invitations for this stable
    const invitations = await stablesRepo.listInvitationsByStable(stableId);

    const enriched = await Promise.all(
      invitations.map(async (inv) => {
        const enrichedInv: Record<string, unknown> = { ...inv };

        // Get invited player name
        if (inv.invitedPlayerId) {
          try {
            const player = await playersRepo.findById(inv.invitedPlayerId);
            if (player) {
              enrichedInv.invitedPlayerName = player.name;
            }
          } catch {
            // Skip enrichment on error
          }
        }

        // Get inviting player name
        if (inv.invitedByPlayerId) {
          try {
            const player = await playersRepo.findById(inv.invitedByPlayerId);
            if (player) {
              enrichedInv.invitedByPlayerName = player.name;
            }
          } catch {
            // Skip enrichment on error
          }
        }

        // Add stable name
        enrichedInv.stableName = stable.name;

        return enrichedInv;
      })
    );

    return success(enriched);
  } catch (err) {
    console.error('Error getting invitations:', err);
    return serverError('Failed to get invitations');
  }
};
