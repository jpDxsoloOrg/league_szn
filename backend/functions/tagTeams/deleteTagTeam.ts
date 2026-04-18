import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
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

    const { tagTeams: tagTeamsRepo, players: playersRepo } = getRepositories();

    // Get tag team to find player references
    const tagTeam = await tagTeamsRepo.findById(tagTeamId);
    if (!tagTeam) {
      return notFound('Tag team not found');
    }

    const now = new Date().toISOString();

    // Check if either player still has this tagTeamId set
    const [player1, player2] = await Promise.all([
      playersRepo.findById(tagTeam.player1Id),
      playersRepo.findById(tagTeam.player2Id),
    ]);

    // Build transaction: delete tag team + clear tagTeamId from players if still set (Wave 7)
    const transactItems: Parameters<typeof dynamoDb.transactWrite>[0]['TransactItems'] = [
      {
        Delete: {
          TableName: TableNames.TAG_TEAMS,
          Key: { tagTeamId },
        },
      },
    ];

    if (player1 && player1.tagTeamId === tagTeamId) {
      transactItems.push({
        Update: {
          TableName: TableNames.PLAYERS,
          Key: { playerId: tagTeam.player1Id },
          UpdateExpression: 'REMOVE #tagTeamId SET #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#tagTeamId': 'tagTeamId',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':updatedAt': now,
          },
        },
      });
    }

    if (player2 && player2.tagTeamId === tagTeamId) {
      transactItems.push({
        Update: {
          TableName: TableNames.PLAYERS,
          Key: { playerId: tagTeam.player2Id },
          UpdateExpression: 'REMOVE #tagTeamId SET #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#tagTeamId': 'tagTeamId',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':updatedAt': now,
          },
        },
      });
    }

    await dynamoDb.transactWrite({ TransactItems: transactItems });

    return noContent();
  } catch (err) {
    console.error('Error deleting tag team:', err);
    return serverError('Failed to delete tag team');
  }
};
