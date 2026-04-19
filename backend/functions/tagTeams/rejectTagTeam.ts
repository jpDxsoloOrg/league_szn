import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireRole(event, 'Moderator');
    if (roleError) return roleError;

    const tagTeamId = event.pathParameters?.tagTeamId;
    if (!tagTeamId) {
      return badRequest('tagTeamId is required');
    }

    const { roster: { tagTeams: tagTeamsRepo } } = getRepositories();

    // Get tag team
    const tagTeam = await tagTeamsRepo.findById(tagTeamId);
    if (!tagTeam) {
      return notFound('Tag team not found');
    }

    if (tagTeam.status !== 'pending_admin') {
      return badRequest('This tag team is not awaiting admin approval');
    }

    const now = new Date().toISOString();

    await tagTeamsRepo.update(tagTeamId, {
      status: 'dissolved',
      dissolvedAt: now,
    });

    return success({
      tagTeamId,
      status: 'dissolved',
      message: 'Tag team rejected',
    });
  } catch (err) {
    console.error('Error rejecting tag team:', err);
    return serverError('Failed to reject tag team');
  }
};
