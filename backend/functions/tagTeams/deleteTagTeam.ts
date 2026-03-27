import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { noContent, badRequest, serverError } from '../../lib/response';
import { requireSuperAdmin } from '../../lib/auth';

interface TagTeamRecord {
  [key: string]: unknown;
  tagTeamId: string;
  player1Id: string;
  player2Id: string;
  status: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireSuperAdmin(event);
    if (roleError) return roleError;

    const tagTeamId = event.pathParameters?.tagTeamId;
    if (!tagTeamId) {
      return badRequest('tagTeamId is required');
    }

    // Get tag team to find player references
    const result = await getOrNotFound<TagTeamRecord>(
      TableNames.TAG_TEAMS,
      { tagTeamId },
      'Tag team not found'
    );

    if ('notFoundResponse' in result) {
      return result.notFoundResponse;
    }

    const tagTeam = result.item;
    const now = new Date().toISOString();

    // Check if either player still has this tagTeamId set
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

    // Build transaction: delete tag team + clear tagTeamId from players if still set
    const transactItems: Parameters<typeof dynamoDb.transactWrite>[0]['TransactItems'] = [
      {
        Delete: {
          TableName: TableNames.TAG_TEAMS,
          Key: { tagTeamId },
        },
      },
    ];

    if (player1Result.Item && player1Result.Item.tagTeamId === tagTeamId) {
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

    if (player2Result.Item && player2Result.Item.tagTeamId === tagTeamId) {
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
