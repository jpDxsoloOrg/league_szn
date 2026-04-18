import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, hasRole, isSuperAdmin } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface RemoveMemberBody {
  playerId: string;
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

    const { data: body, error: parseError } = parseBody<RemoveMemberBody>(event);
    if (parseError) return parseError;

    const { playerId } = body;

    if (!playerId) {
      return badRequest('playerId is required');
    }

    const { stables: stablesRepo, players: playersRepo } = getRepositories();

    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    // Only leader or Admin can remove members
    if (!isSuperAdmin(auth)) {
      const callerPlayer = await playersRepo.findByUserId(auth.sub);
      if (!callerPlayer || callerPlayer.playerId !== stable.leaderId) {
        return badRequest('Only the stable leader or an admin can remove members');
      }
    }

    // Cannot remove the leader
    if (playerId === stable.leaderId) {
      return badRequest('Cannot remove the leader. Disband the stable instead.');
    }

    // Verify player is a member
    if (!stable.memberIds.includes(playerId)) {
      return badRequest('Player is not a member of this stable');
    }

    const now = new Date().toISOString();
    const updatedMemberIds = stable.memberIds.filter((id) => id !== playerId);

    // Clear the player's stableId
    // Note: using dynamoDb directly for REMOVE expression on player records (Wave 7)
    await dynamoDb.update({
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
    });

    // If only 1 member left (the leader), auto-disband
    if (updatedMemberIds.length <= 1) {
      await stablesRepo.update(stableId, {
        memberIds: updatedMemberIds,
        status: 'disbanded',
        disbandedAt: now,
      });

      // Clear the leader's stableId too
      if (updatedMemberIds.length === 1) {
        await dynamoDb.update({
          TableName: TableNames.PLAYERS,
          Key: { playerId: stable.leaderId },
          UpdateExpression: 'REMOVE #stableId SET #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#stableId': 'stableId',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':updatedAt': now,
          },
        });
      }

      return success({
        message: 'Member removed. Stable auto-disbanded (only leader remaining).',
        stableId,
        status: 'disbanded',
      });
    }

    // Update stable memberIds
    await stablesRepo.update(stableId, {
      memberIds: updatedMemberIds,
    });

    return success({
      message: 'Member removed from stable',
      stableId,
      removedPlayerId: playerId,
      remainingMembers: updatedMemberIds.length,
    });
  } catch (err) {
    console.error('Error removing member:', err);
    return serverError('Failed to remove member');
  }
};
