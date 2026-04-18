import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError, forbidden } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface RespondToTagTeamBody {
  action: 'accept' | 'decline';
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can respond to tag team invitations');
    }

    const tagTeamId = event.pathParameters?.tagTeamId;
    if (!tagTeamId) {
      return badRequest('tagTeamId is required');
    }

    const { data: body, error: parseError } = parseBody<RespondToTagTeamBody>(event);
    if (parseError) return parseError;
    const { action } = body;

    if (!action || (action !== 'accept' && action !== 'decline')) {
      return badRequest('action must be "accept" or "decline"');
    }

    const { tagTeams: tagTeamsRepo, players: playersRepo } = getRepositories();

    // Get tag team
    const tagTeam = await tagTeamsRepo.findById(tagTeamId);
    if (!tagTeam) {
      return notFound('Tag team not found');
    }

    if (tagTeam.status !== 'pending_partner') {
      return badRequest('This tag team is not awaiting partner response');
    }

    // Verify caller is player2 (the invited partner)
    const callerPlayer = await playersRepo.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    if (callerPlayer.playerId !== tagTeam.player2Id) {
      return forbidden('Only the invited partner can respond to this invitation');
    }

    const now = new Date().toISOString();
    const newStatus = action === 'accept' ? 'pending_admin' : 'dissolved';

    const updatePatch: Record<string, unknown> = {
      status: newStatus,
    };

    if (action === 'decline') {
      updatePatch.dissolvedAt = now;
    }

    await tagTeamsRepo.update(tagTeamId, updatePatch);

    return success({
      tagTeamId,
      status: newStatus,
      message: action === 'accept'
        ? 'Invitation accepted, awaiting admin approval'
        : 'Invitation declined',
    });
  } catch (err) {
    console.error('Error responding to tag team:', err);
    return serverError('Failed to respond to tag team invitation');
  }
};
