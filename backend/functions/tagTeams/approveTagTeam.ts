import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

interface TagTeamRecord {
  [key: string]: unknown;
  tagTeamId: string;
  name: string;
  player1Id: string;
  player2Id: string;
  status: string;
}

interface PlayerRecord {
  playerId: string;
  tagTeamId?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireRole(event, 'Moderator');
    if (roleError) return roleError;

    const tagTeamId = event.pathParameters?.tagTeamId;
    if (!tagTeamId) {
      return badRequest('tagTeamId is required');
    }

    // Get tag team
    const result = await getOrNotFound<TagTeamRecord>(
      TableNames.TAG_TEAMS,
      { tagTeamId },
      'Tag team not found'
    );

    if ('notFoundResponse' in result) {
      return result.notFoundResponse;
    }

    const tagTeam = result.item;

    if (tagTeam.status !== 'pending_admin') {
      return badRequest('This tag team is not awaiting admin approval');
    }

    // Verify both players still exist and neither already has a tag team (race condition check)
    const [player1Result, player2Result] = await Promise.all([
      dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId: tagTeam.player1Id },
      }),
      dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId: tagTeam.player2Id },
      }),
    ]);

    const player1 = player1Result.Item as PlayerRecord | undefined;
    const player2 = player2Result.Item as PlayerRecord | undefined;

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

    // Use transactWrite to atomically update tag team status and both player records
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
