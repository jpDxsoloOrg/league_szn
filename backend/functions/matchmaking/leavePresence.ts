import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { noContent, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

async function expirePendingInvitations(
  indexName: 'FromPlayerIndex' | 'ToPlayerIndex',
  keyField: 'fromPlayerId' | 'toPlayerId',
  playerId: string
): Promise<void> {
  const result = await dynamoDb.query({
    TableName: TableNames.MATCH_INVITATIONS,
    IndexName: indexName,
    KeyConditionExpression: `${keyField} = :pid`,
    ExpressionAttributeValues: { ':pid': playerId },
  });

  const items = (result.Items || []) as Array<Record<string, unknown>>;
  const pending = items.filter((item) => item.status === 'pending');

  if (pending.length === 0) return;

  const updatedAt = new Date().toISOString();

  await Promise.all(
    pending.map((item) =>
      dynamoDb.update({
        TableName: TableNames.MATCH_INVITATIONS,
        Key: { invitationId: item.invitationId as string },
        UpdateExpression: 'SET #s = :expired, #u = :updatedAt',
        ExpressionAttributeNames: {
          '#s': 'status',
          '#u': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':expired': 'expired',
          ':updatedAt': updatedAt,
        },
      })
    )
  );
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can leave presence');
    }

    // Find the caller's player record via their user sub
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = playerResult.Items?.[0];
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const playerId = callerPlayer.playerId as string;

    // Remove presence and queue entries (idempotent)
    await Promise.all([
      dynamoDb.delete({
        TableName: TableNames.PRESENCE,
        Key: { playerId },
      }),
      dynamoDb.delete({
        TableName: TableNames.MATCHMAKING_QUEUE,
        Key: { playerId },
      }),
    ]);

    // Expire pending invitations in both directions
    await Promise.all([
      expirePendingInvitations('FromPlayerIndex', 'fromPlayerId', playerId),
      expirePendingInvitations('ToPlayerIndex', 'toPlayerId', playerId),
    ]);

    return noContent();
  } catch (err) {
    console.error('Error leaving presence:', err);
    return serverError('Failed to leave presence');
  }
};
