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

    const { roster: { tagTeams: tagTeamsRepo, players: playersRepo }, runInTransaction } = getRepositories();

    // Get tag team
    const tagTeam = await tagTeamsRepo.findById(tagTeamId);
    if (!tagTeam) {
      return notFound('Tag team not found');
    }

    if (tagTeam.status !== 'pending_admin') {
      return badRequest('This tag team is not awaiting admin approval');
    }

    // Verify both players still exist and neither already has a tag team (race condition check)
    const [player1, player2] = await Promise.all([
      playersRepo.findById(tagTeam.player1Id),
      playersRepo.findById(tagTeam.player2Id),
    ]);

    if (!player1) {
      return badRequest('Player 1 no longer exists');
    }
    if (!player2) {
      return badRequest('Player 2 no longer exists');
    }
    if (player1.tagTeamId) {
      return badRequest('Player 1 is already in a tag team');
    }
    if (player2.tagTeamId) {
      return badRequest('Player 2 is already in a tag team');
    }

    // Atomically update tag team status and both player records
    await runInTransaction(async (tx) => {
      tx.updateTagTeam(tagTeamId, { status: 'active' });
      tx.setPlayerTagTeamId(tagTeam.player1Id, tagTeamId);
      tx.setPlayerTagTeamId(tagTeam.player2Id, tagTeamId);
    });

    return success({
      tagTeamId,
      status: 'active',
      message: 'Tag team approved and activated',
    });
  } catch (err) {
    console.error('Error approving tag team:', err);
    return serverError('Failed to approve tag team');
  }
};
