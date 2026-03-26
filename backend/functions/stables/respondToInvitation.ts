import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface RespondBody {
  action: 'accept' | 'decline';
}

interface InvitationRecord {
  [key: string]: unknown;
  invitationId: string;
  stableId: string;
  playerId: string;
  status: string;
}

interface StableRecord {
  [key: string]: unknown;
  stableId: string;
  memberIds: string[];
  status: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can respond to invitations');
    }

    const stableId = event.pathParameters?.stableId;
    const invitationId = event.pathParameters?.invitationId;
    if (!stableId || !invitationId) {
      return badRequest('stableId and invitationId are required');
    }

    const { data: body, error: parseError } = parseBody<RespondBody>(event);
    if (parseError) return parseError;

    const { action } = body;

    if (action !== 'accept' && action !== 'decline') {
      return badRequest('action must be "accept" or "decline"');
    }

    // Get invitation
    const invitationResult = await getOrNotFound<InvitationRecord>(
      TableNames.STABLE_INVITATIONS,
      { invitationId },
      'Invitation not found'
    );

    if ('notFoundResponse' in invitationResult) {
      return invitationResult.notFoundResponse;
    }

    const invitation = invitationResult.item;

    if (invitation.status !== 'pending') {
      return badRequest(`Invitation is already ${invitation.status}`);
    }

    if (invitation.stableId !== stableId) {
      return badRequest('Invitation does not belong to this stable');
    }

    // Verify caller is the invited player
    const callerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = callerResult.Items?.[0];
    if (!callerPlayer || callerPlayer.playerId !== invitation.playerId) {
      return badRequest('You can only respond to your own invitations');
    }

    const now = new Date().toISOString();

    if (action === 'decline') {
      await dynamoDb.update({
        TableName: TableNames.STABLE_INVITATIONS,
        Key: { invitationId },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': 'declined',
          ':updatedAt': now,
        },
      });

      return success({ message: 'Invitation declined', invitationId });
    }

    // action === 'accept'
    // Verify player still has no stable (use ConditionExpression)
    try {
      await dynamoDb.update({
        TableName: TableNames.PLAYERS,
        Key: { playerId: invitation.playerId },
        UpdateExpression: 'SET #stableId = :stableId, #updatedAt = :updatedAt',
        ConditionExpression: 'attribute_not_exists(#stableId) OR #stableId = :empty',
        ExpressionAttributeNames: {
          '#stableId': 'stableId',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':stableId': stableId,
          ':updatedAt': now,
          ':empty': '',
        },
      });
    } catch (conditionErr: unknown) {
      if (
        conditionErr instanceof Error &&
        conditionErr.name === 'ConditionalCheckFailedException'
      ) {
        return badRequest('You already belong to a stable');
      }
      throw conditionErr;
    }

    // Get stable to update memberIds
    const stableResult = await getOrNotFound<StableRecord>(
      TableNames.STABLES,
      { stableId },
      'Stable not found'
    );

    if ('notFoundResponse' in stableResult) {
      return stableResult.notFoundResponse;
    }

    const stable = stableResult.item;
    const updatedMemberIds = [...stable.memberIds, invitation.playerId];

    // Determine new status: if approved and now >= 2 members, set to active
    const newStatus =
      stable.status === 'approved' && updatedMemberIds.length >= 2
        ? 'active'
        : stable.status;

    await dynamoDb.update({
      TableName: TableNames.STABLES,
      Key: { stableId },
      UpdateExpression: 'SET #memberIds = :memberIds, #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#memberIds': 'memberIds',
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':memberIds': updatedMemberIds,
        ':status': newStatus,
        ':updatedAt': now,
      },
    });

    // Update invitation status
    await dynamoDb.update({
      TableName: TableNames.STABLE_INVITATIONS,
      Key: { invitationId },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': 'accepted',
        ':updatedAt': now,
      },
    });

    return success({
      message: 'Invitation accepted',
      invitationId,
      stableId,
      newStatus,
    });
  } catch (err) {
    console.error('Error responding to invitation:', err);
    return serverError('Failed to respond to invitation');
  }
};
