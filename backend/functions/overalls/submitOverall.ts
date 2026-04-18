import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface SubmitOverallBody {
  mainOverall: number;
  alternateOverall?: number;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    // Note: Players repo not yet migrated (Wave 4), using dynamoDb directly
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': sub },
    });

    if (!playerResult.Items || playerResult.Items.length === 0) {
      return notFound('No player profile found for this user');
    }

    const playerId = playerResult.Items[0].playerId as string;

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

    const { overalls } = getRepositories();
    const item = await overalls.submit({ playerId, mainOverall, alternateOverall });

    return success(item);
  } catch (err) {
    console.error('Error submitting wrestler overall:', err);
    return serverError('Failed to submit wrestler overall');
  }
};
