import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound, buildUpdateExpression } from '../../lib/dynamodb';
import { success, badRequest, serverError, forbidden } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface UpdateTagTeamBody {
  name?: string;
  imageUrl?: string;
}

interface TagTeamRecord {
  [key: string]: unknown;
  tagTeamId: string;
  player1Id: string;
  player2Id: string;
  status: string;
}

interface PlayerRecord {
  playerId: string;
  userId?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers or admins can update tag teams');
    }

    const tagTeamId = event.pathParameters?.tagTeamId;
    if (!tagTeamId) {
      return badRequest('tagTeamId is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateTagTeamBody>(event);
    if (parseError) return parseError;
    const { name, imageUrl } = body;

    // Get existing tag team
    const result = await getOrNotFound<TagTeamRecord>(
      TableNames.TAG_TEAMS,
      { tagTeamId },
      'Tag team not found'
    );

    if ('notFoundResponse' in result) {
      return result.notFoundResponse;
    }

    const tagTeam = result.item;

    // Unless Admin, verify caller is a member of the tag team
    if (!hasRole(auth, 'Admin')) {
      const callerResult = await dynamoDb.query({
        TableName: TableNames.PLAYERS,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': auth.sub },
      });

      const callerPlayer = callerResult.Items?.[0] as PlayerRecord | undefined;
      if (!callerPlayer) {
        return badRequest('No player profile linked to your account');
      }

      if (
        callerPlayer.playerId !== tagTeam.player1Id &&
        callerPlayer.playerId !== tagTeam.player2Id
      ) {
        return forbidden('Only tag team members or admins can update this tag team');
      }
    }

    const updateFields: Record<string, unknown> = {};
    if (name !== undefined) updateFields.name = name;
    if (imageUrl !== undefined) updateFields.imageUrl = imageUrl;

    const updateExpr = buildUpdateExpression(updateFields);
    if (!updateExpr.hasChanges) {
      return badRequest('No fields to update');
    }

    await dynamoDb.update({
      TableName: TableNames.TAG_TEAMS,
      Key: { tagTeamId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
    });

    // Return updated tag team
    const updatedResult = await dynamoDb.get({
      TableName: TableNames.TAG_TEAMS,
      Key: { tagTeamId },
    });

    return success(updatedResult.Item);
  } catch (err) {
    console.error('Error updating tag team:', err);
    return serverError('Failed to update tag team');
  }
};
