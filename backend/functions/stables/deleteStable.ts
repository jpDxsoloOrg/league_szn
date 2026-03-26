import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { noContent, badRequest, serverError } from '../../lib/response';
import { requireSuperAdmin } from '../../lib/auth';

interface StableRecord {
  [key: string]: unknown;
  stableId: string;
  memberIds: string[];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireSuperAdmin(event);
    if (roleError) return roleError;

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const result = await getOrNotFound<StableRecord>(
      TableNames.STABLES,
      { stableId },
      'Stable not found'
    );

    if ('notFoundResponse' in result) {
      return result.notFoundResponse;
    }

    const stable = result.item;
    const now = new Date().toISOString();

    // Clear stableId from all member players
    const clearPlayerPromises = stable.memberIds.map((playerId) =>
      dynamoDb.update({
        TableName: TableNames.PLAYERS,
        Key: { playerId },
        UpdateExpression: 'REMOVE #stableId SET #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#stableId': 'stableId',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':updatedAt': now,
        },
      })
    );

    // Delete all invitations for this stable
    const invitations = await dynamoDb.scanAll({
      TableName: TableNames.STABLE_INVITATIONS,
      FilterExpression: '#stableId = :stableId',
      ExpressionAttributeNames: { '#stableId': 'stableId' },
      ExpressionAttributeValues: { ':stableId': stableId },
    });

    const deleteInvitationPromises = invitations.map((inv) =>
      dynamoDb.delete({
        TableName: TableNames.STABLE_INVITATIONS,
        Key: { invitationId: inv.invitationId },
      })
    );

    // Execute all cleanup in parallel
    await Promise.all([...clearPlayerPromises, ...deleteInvitationPromises]);

    // Hard delete the stable record
    await dynamoDb.delete({
      TableName: TableNames.STABLES,
      Key: { stableId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting stable:', err);
    return serverError('Failed to delete stable');
  }
};
