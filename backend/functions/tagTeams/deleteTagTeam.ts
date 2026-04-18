import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireSuperAdmin } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireSuperAdmin(event);
    if (roleError) return roleError;

    const tagTeamId = event.pathParameters?.tagTeamId;
    if (!tagTeamId) {
      return badRequest('tagTeamId is required');
    }

    const { tagTeams: tagTeamsRepo, players: playersRepo, runInTransaction } = getRepositories();

    // Get tag team to find player references
    const tagTeam = await tagTeamsRepo.findById(tagTeamId);
    if (!tagTeam) {
      return notFound('Tag team not found');
    }

    // Check if either player still has this tagTeamId set
    const [player1, player2] = await Promise.all([
      playersRepo.findById(tagTeam.player1Id),
      playersRepo.findById(tagTeam.player2Id),
    ]);

    // Build transaction: delete tag team + clear tagTeamId from players if still set
    await runInTransaction(async (tx) => {
      tx.deleteTagTeam(tagTeamId);

      if (player1 && player1.tagTeamId === tagTeamId) {
        tx.clearPlayerField(tagTeam.player1Id, 'tagTeamId');
      }

      if (player2 && player2.tagTeamId === tagTeamId) {
        tx.clearPlayerField(tagTeam.player2Id, 'tagTeamId');
      }
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting tag team:', err);
    return serverError('Failed to delete tag team');
  }
};
