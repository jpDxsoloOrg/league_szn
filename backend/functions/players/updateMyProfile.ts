import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext, requireRole } from '../../lib/auth';

const ALLOWED_FIELDS = ['name', 'currentWrestler', 'imageUrl'];
const MAX_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 2048;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    // Look up the player by userId via UserIdIndex GSI
    const queryResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': sub,
      },
    });

    if (!queryResult.Items || queryResult.Items.length === 0) {
      return notFound('No player profile found for this user');
    }

    const player = queryResult.Items[0];
    const playerId = player.playerId as string;

    // Build update expression from whitelisted fields only
    const setExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        const value = body[field];

        if (typeof value !== 'string') {
          return badRequest(`Field ${field} must be a string`);
        }

        if ((field === 'name' || field === 'currentWrestler') && value.length > MAX_NAME_LENGTH) {
          return badRequest(`Field ${field} must be ${MAX_NAME_LENGTH} characters or less`);
        }

        if (field === 'name' && value.trim().length === 0) {
          return badRequest('Name cannot be empty');
        }

        if (field === 'imageUrl' && value.length > MAX_URL_LENGTH) {
          return badRequest(`Image URL must be ${MAX_URL_LENGTH} characters or less`);
        }

        setExpressions.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = value;
      }
    }

    // Always update updatedAt
    setExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (setExpressions.length === 1) {
      return badRequest('No valid fields to update. Allowed fields: ' + ALLOWED_FIELDS.join(', '));
    }

    const updateExpression = `SET ${setExpressions.join(', ')}`;

    const result = await dynamoDb.update({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating player profile:', err);
    return serverError('Failed to update player profile');
  }
};
