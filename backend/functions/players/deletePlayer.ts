import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;

    if (!playerId) {
      return badRequest('Player ID is required');
    }

    // Check if player exists
    const existingPlayer = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
    });

    if (!existingPlayer.Item) {
      return notFound('Player not found');
    }

    // Check if player is a current champion
    const championshipsResult = await dynamoDb.scan({
      TableName: TableNames.CHAMPIONSHIPS,
      FilterExpression: 'contains(#currentChampion, :playerId)',
      ExpressionAttributeNames: {
        '#currentChampion': 'currentChampion',
      },
      ExpressionAttributeValues: {
        ':playerId': playerId,
      },
    });

    if (championshipsResult.Items && championshipsResult.Items.length > 0) {
      const championshipNames = championshipsResult.Items.map((c: any) => c.name).join(', ');
      return badRequest(
        `Cannot delete player. They are currently champion of: ${championshipNames}. Remove their championship first.`
      );
    }

    // Delete the player
    await dynamoDb.delete({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
    });

    // Also delete from season standings
    const standingsResult = await dynamoDb.query({
      TableName: TableNames.SEASON_STANDINGS,
      IndexName: 'PlayerIndex',
      KeyConditionExpression: '#playerId = :playerId',
      ExpressionAttributeNames: {
        '#playerId': 'playerId',
      },
      ExpressionAttributeValues: {
        ':playerId': playerId,
      },
    });

    if (standingsResult.Items && standingsResult.Items.length > 0) {
      for (const standing of standingsResult.Items) {
        await dynamoDb.delete({
          TableName: TableNames.SEASON_STANDINGS,
          Key: {
            seasonId: (standing as any).seasonId,
            playerId: playerId,
          },
        });
      }
    }

    return success({ message: 'Player deleted successfully' });
  } catch (err) {
    console.error('Error deleting player:', err);
    return serverError('Failed to delete player');
  }
};
