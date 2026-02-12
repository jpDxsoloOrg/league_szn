import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError, conflict } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface CreateSeasonBody {
  name: string;
  startDate: string;
  endDate?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody<CreateSeasonBody>(event);
    if (parseError) return parseError;

    if (!body.name || !body.startDate) {
      return badRequest('Season name and start date are required');
    }

    // Check if there's already an active season
    const existingSeasons = await dynamoDb.scan({
      TableName: TableNames.SEASONS,
      FilterExpression: '#status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':active': 'active' },
    });

    if (existingSeasons.Items && existingSeasons.Items.length > 0) {
      return conflict('There is already an active season. Please end the current season before creating a new one.');
    }

    const season = {
      seasonId: uuidv4(),
      name: body.name,
      startDate: body.startDate,
      endDate: body.endDate || null,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await dynamoDb.put({
      TableName: TableNames.SEASONS,
      Item: season,
    });

    return created(season);
  } catch (err) {
    console.error('Error creating season:', err);
    return serverError('Failed to create season');
  }
};
