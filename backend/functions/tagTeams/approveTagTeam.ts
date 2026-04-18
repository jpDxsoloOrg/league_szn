import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
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

    const { tagTeams: tagTeamsRepo, players: playersRepo } = getRepositories();

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

    const now = new Date().toISOString();

    // Use transactWrite to atomically update tag team status and both player records (Wave 7)
    await dynamoDb.transactWrite({
      TransactItems: [
        {
          Update: {
            TableName: TableNames.TAG_TEAMS,
            Key: { tagTeamId },
            UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':status': 'active',
              ':updatedAt': now,
            },
          },
        },
        {
          Update: {
            TableName: TableNames.PLAYERS,
            Key: { playerId: tagTeam.player1Id },
            UpdateExpression: 'SET #tagTeamId = :tagTeamId, #updatedAt = :updatedAt',
            ConditionExpression: 'attribute_not_exists(#tagTeamId) OR #tagTeamId = :null',
            ExpressionAttributeNames: {
              '#tagTeamId': 'tagTeamId',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':tagTeamId': tagTeamId,
              ':updatedAt': now,
              ':null': null,
            },
          },
        },
        {
          Update: {
            TableName: TableNames.PLAYERS,
            Key: { playerId: tagTeam.player2Id },
            UpdateExpression: 'SET #tagTeamId = :tagTeamId, #updatedAt = :updatedAt',
            ConditionExpression: 'attribute_not_exists(#tagTeamId) OR #tagTeamId = :null',
            ExpressionAttributeNames: {
              '#tagTeamId': 'tagTeamId',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':tagTeamId': tagTeamId,
              ':updatedAt': now,
              ':null': null,
            },
          },
        },
      ],
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
