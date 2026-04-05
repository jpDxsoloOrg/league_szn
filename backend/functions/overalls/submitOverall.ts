import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface SubmitOverallBody {
  mainOverall: number;
  alternateOverall?: number;
}

interface OverallRecord {
  playerId: string;
  mainOverall: number;
  alternateOverall?: number;
  submittedAt: string;
  updatedAt: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': sub,
      },
    });

    if (!playerResult.Items || playerResult.Items.length === 0) {
      return notFound('No player profile found for this user');
    }

    const player = playerResult.Items[0];
    const playerId = player.playerId as string;

    const parsed = parseBody<SubmitOverallBody>(event);
    if (parsed.error) return parsed.error;
    const { mainOverall, alternateOverall } = parsed.data;

    if (
      typeof mainOverall !== 'number' ||
      !Number.isInteger(mainOverall) ||
      mainOverall < 60 ||
      mainOverall > 99
    ) {
      return badRequest('mainOverall must be an integer between 60 and 99');
    }

    if (alternateOverall !== undefined) {
      if (
        typeof alternateOverall !== 'number' ||
        !Number.isInteger(alternateOverall) ||
        alternateOverall < 60 ||
        alternateOverall > 99
      ) {
        return badRequest('alternateOverall must be an integer between 60 and 99');
      }
    }

    // Check if an existing record exists to preserve submittedAt
    const existingResult = await dynamoDb.get({
      TableName: TableNames.WRESTLER_OVERALLS,
      Key: { playerId },
    });

    const now = new Date().toISOString();
    const submittedAt =
      existingResult.Item && existingResult.Item.submittedAt
        ? (existingResult.Item.submittedAt as string)
        : now;

    const item: OverallRecord = {
      playerId,
      mainOverall,
      updatedAt: now,
      submittedAt,
    };

    if (alternateOverall !== undefined) {
      item.alternateOverall = alternateOverall;
    }

    await dynamoDb.put({
      TableName: TableNames.WRESTLER_OVERALLS,
      Item: item,
    });

    return success(item);
  } catch (err) {
    console.error('Error submitting wrestler overall:', err);
    return serverError('Failed to submit wrestler overall');
  }
};
