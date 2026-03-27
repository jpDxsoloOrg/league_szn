import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound, buildUpdateExpression } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole, isSuperAdmin } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface UpdateStableBody {
  name?: string;
  imageUrl?: string;
}

interface StableRecord {
  [key: string]: unknown;
  stableId: string;
  leaderId: string;
  status: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Insufficient permissions');
    }

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateStableBody>(event);
    if (parseError) return parseError;

    const result = await getOrNotFound<StableRecord>(
      TableNames.STABLES,
      { stableId },
      'Stable not found'
    );

    if ('notFoundResponse' in result) {
      return result.notFoundResponse;
    }

    const stable = result.item;

    // Only leader or Admin can update
    if (!isSuperAdmin(auth)) {
      // Find caller's player record
      const playerResult = await dynamoDb.query({
        TableName: TableNames.PLAYERS,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': auth.sub },
      });

      const callerPlayer = playerResult.Items?.[0];
      if (!callerPlayer || callerPlayer.playerId !== stable.leaderId) {
        return badRequest('Only the stable leader or an admin can update this stable');
      }
    }

    const fields: Record<string, unknown> = {};
    if (body.name !== undefined) fields.name = body.name.trim();
    if (body.imageUrl !== undefined) fields.imageUrl = body.imageUrl;

    const updateExpr = buildUpdateExpression(fields);

    if (!updateExpr.hasChanges) {
      return badRequest('No fields to update');
    }

    await dynamoDb.update({
      TableName: TableNames.STABLES,
      Key: { stableId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
    });

    // Return updated stable
    const updated = await dynamoDb.get({
      TableName: TableNames.STABLES,
      Key: { stableId },
    });

    return success(updated.Item);
  } catch (err) {
    console.error('Error updating stable:', err);
    return serverError('Failed to update stable');
  }
};
