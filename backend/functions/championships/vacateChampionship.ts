import { APIGatewayProxyHandler } from 'aws-lambda';
import { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const championshipResult = await getOrNotFound(
      TableNames.CHAMPIONSHIPS,
      { championshipId },
      'Championship not found'
    );
    if ('notFoundResponse' in championshipResult) {
      return championshipResult.notFoundResponse;
    }

    const championship = championshipResult.item;

    if (!championship.currentChampion) {
      return badRequest('Championship is already vacant');
    }

    const transactItems: any[] = [];

    // Remove current champion from the championship
    transactItems.push({
      Update: {
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId },
        UpdateExpression: 'REMOVE currentChampion SET updatedAt = :updatedAt, version = if_not_exists(version, :zero) + :one',
        ExpressionAttributeValues: {
          ':updatedAt': new Date().toISOString(),
          ':zero': 0,
          ':one': 1,
        },
      },
    });

    // Close the current reign in championship history
    const historyResult = await dynamoDb.query({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      KeyConditionExpression: 'championshipId = :championshipId',
      FilterExpression: 'attribute_not_exists(lostDate)',
      ExpressionAttributeValues: { ':championshipId': championshipId },
      ScanIndexForward: false,
      Limit: 1,
    });

    if (historyResult.Items && historyResult.Items.length > 0) {
      const currentReign = historyResult.Items[0];
      const wonDate = new Date(currentReign.wonDate as string);
      const lostDate = new Date();
      const daysHeld = Math.floor((lostDate.getTime() - wonDate.getTime()) / (1000 * 60 * 60 * 24));

      transactItems.push({
        Update: {
          TableName: TableNames.CHAMPIONSHIP_HISTORY,
          Key: {
            championshipId: currentReign.championshipId,
            wonDate: currentReign.wonDate,
          },
          UpdateExpression: 'SET lostDate = :lostDate, daysHeld = :daysHeld',
          ExpressionAttributeValues: {
            ':lostDate': lostDate.toISOString(),
            ':daysHeld': daysHeld,
          },
        },
      });
    }

    await dynamoDb.transactWrite({
      TransactItems: transactItems,
    } as TransactWriteCommandInput);

    // Return the updated championship
    const updated = await dynamoDb.get({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId },
    });

    return success(updated.Item);
  } catch (err) {
    console.error('Error vacating championship:', err);
    return serverError('Failed to vacate championship');
  }
};
