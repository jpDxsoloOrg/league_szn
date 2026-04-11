import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import {
  badRequest,
  notFound,
  forbidden,
  serverError,
  noContent,
} from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { createNotification } from '../../lib/notifications';

type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

interface InvitationRow {
  invitationId: string;
  fromPlayerId: string;
  toPlayerId: string;
  status: InvitationStatus;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

interface PlayerRecord {
  playerId: string;
  name: string;
  userId?: string;
  [key: string]: unknown;
}

interface ConditionalCheckFailed extends Error {
  name: 'ConditionalCheckFailedException';
}

function isConditionalCheckFailed(err: unknown): err is ConditionalCheckFailed {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'ConditionalCheckFailedException'
  );
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can decline match invitations');
    }

    // Find the caller's player record via their user sub
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = playerResult.Items?.[0] as PlayerRecord | undefined;
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const invitationId = event.pathParameters?.invitationId;
    if (!invitationId) {
      return badRequest('invitationId is required');
    }

    const invitationResult = await dynamoDb.get({
      TableName: TableNames.MATCH_INVITATIONS,
      Key: { invitationId },
    });

    if (!invitationResult.Item) {
      return notFound('Match invitation not found');
    }

    const invitation = invitationResult.Item as InvitationRow;

    if (invitation.toPlayerId !== callerPlayer.playerId) {
      return forbidden('You cannot decline an invitation that is not addressed to you');
    }

    if (invitation.status !== 'pending') {
      return badRequest('Only pending invitations can be declined');
    }

    const now = new Date().toISOString();

    try {
      await dynamoDb.update({
        TableName: TableNames.MATCH_INVITATIONS,
        Key: { invitationId },
        UpdateExpression: 'SET #s = :declined, #u = :now',
        ConditionExpression: '#s = :pending',
        ExpressionAttributeNames: {
          '#s': 'status',
          '#u': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':declined': 'declined',
          ':pending': 'pending',
          ':now': now,
        },
      });
    } catch (err: unknown) {
      if (isConditionalCheckFailed(err)) {
        return badRequest('Only pending invitations can be declined');
      }
      throw err;
    }

    // Look up the inviter to notify them
    const inviterResult = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId: invitation.fromPlayerId },
    });

    const inviter = inviterResult.Item as PlayerRecord | undefined;
    if (inviter?.userId) {
      await createNotification({
        userId: inviter.userId,
        type: 'match_invitation_declined',
        message: `${callerPlayer.name} declined your match invitation.`,
        sourceId: invitationId,
        sourceType: 'match_invitation',
      });
    }

    return noContent();
  } catch (err) {
    console.error('Error declining match invitation:', err);
    return serverError('Failed to decline match invitation');
  }
};
