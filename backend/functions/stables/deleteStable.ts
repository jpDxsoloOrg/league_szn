import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireSuperAdmin } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireSuperAdmin(event);
    if (roleError) return roleError;

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const { stables: stablesRepo } = getRepositories();

    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    const now = new Date().toISOString();

    // Clear stableId from all member players
    // Note: using dynamoDb directly for REMOVE expression on player records (Wave 7)
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
    const invitations = await stablesRepo.listInvitationsByStable(stableId);

    const deleteInvitationPromises = invitations.map((inv) =>
      dynamoDb.delete({
        TableName: TableNames.STABLE_INVITATIONS,
        Key: { invitationId: inv.invitationId },
      })
    );

    // Execute all cleanup in parallel
    await Promise.all([...clearPlayerPromises, ...deleteInvitationPromises]);

    // Hard delete the stable record
    await stablesRepo.delete(stableId);

    return noContent();
  } catch (err) {
    console.error('Error deleting stable:', err);
    return serverError('Failed to delete stable');
  }
};
