import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can view invitations');
    }

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    // Verify caller is the stable leader
    const callerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = callerResult.Items?.[0];
    if (!callerPlayer) {
      return badRequest('Player not found');
    }

    // Query invitations for this stable using the StableIndex GSI
    const result = await dynamoDb.query({
      TableName: TableNames.STABLE_INVITATIONS,
      IndexName: 'StableIndex',
      KeyConditionExpression: '#stableId = :stableId',
      ExpressionAttributeNames: {
        '#stableId': 'stableId',
      },
      ExpressionAttributeValues: {
        ':stableId': stableId,
      },
      ScanIndexForward: false, // newest first
    });

    const invitations = result.Items || [];

    // Enrich with player names
    const enriched = await Promise.all(
      invitations.map(async (inv) => {
        const enrichedInv = { ...inv };

        // Get invited player name
        if (inv.invitedPlayerId) {
          try {
            const playerResult = await dynamoDb.get({
              TableName: TableNames.PLAYERS,
              Key: { playerId: inv.invitedPlayerId },
            });
            if (playerResult.Item) {
              enrichedInv.invitedPlayerName = playerResult.Item.name;
            }
          } catch {
            // Skip enrichment on error
          }
        }

        // Get inviting player name
        if (inv.invitedByPlayerId) {
          try {
            const playerResult = await dynamoDb.get({
              TableName: TableNames.PLAYERS,
              Key: { playerId: inv.invitedByPlayerId },
            });
            if (playerResult.Item) {
              enrichedInv.invitedByPlayerName = playerResult.Item.name;
            }
          } catch {
            // Skip enrichment on error
          }
        }

        // Get stable name
        if (inv.stableId) {
          try {
            const stableResult = await dynamoDb.get({
              TableName: TableNames.STABLES,
              Key: { stableId: inv.stableId },
            });
            if (stableResult.Item) {
              enrichedInv.stableName = stableResult.Item.name;
            }
          } catch {
            // Skip enrichment on error
          }
        }

        return enrichedInv;
      })
    );

    return success(enriched);
  } catch (err) {
    console.error('Error getting invitations:', err);
    return serverError('Failed to get invitations');
  }
};
