import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { v4 as uuidv4 } from 'uuid';

interface InviteBody {
  playerId: string;
  message?: string;
}

interface StableRecord {
  [key: string]: unknown;
  stableId: string;
  leaderId: string;
  memberIds: string[];
  status: string;
}

interface PlayerRecord {
  [key: string]: unknown;
  playerId: string;
  stableId?: string;
}

const MAX_STABLE_MEMBERS = 6;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can invite to stables');
    }

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const { data: body, error: parseError } = parseBody<InviteBody>(event);
    if (parseError) return parseError;

    const { playerId, message } = body;

    if (!playerId) {
      return badRequest('playerId is required');
    }

    // Get stable
    const stableResult = await getOrNotFound<StableRecord>(
      TableNames.STABLES,
      { stableId },
      'Stable not found'
    );

    if ('notFoundResponse' in stableResult) {
      return stableResult.notFoundResponse;
    }

    const stable = stableResult.item;

    // Verify caller is the stable leader
    const callerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = callerResult.Items?.[0];
    if (!callerPlayer || callerPlayer.playerId !== stable.leaderId) {
      return badRequest('Only the stable leader can invite members');
    }

    // Verify stable status
    if (stable.status !== 'approved' && stable.status !== 'active') {
      return badRequest('Can only invite members to approved or active stables');
    }

    // Verify stable has room
    if (stable.memberIds.length >= MAX_STABLE_MEMBERS) {
      return badRequest(`Stable already has the maximum of ${MAX_STABLE_MEMBERS} members`);
    }

    // Verify invited player exists and has no stable
    const invitedResult = await getOrNotFound<PlayerRecord>(
      TableNames.PLAYERS,
      { playerId },
      'Invited player not found'
    );

    if ('notFoundResponse' in invitedResult) {
      return invitedResult.notFoundResponse;
    }

    const invitedPlayer = invitedResult.item;

    if (invitedPlayer.stableId) {
      return badRequest('Player already belongs to a stable');
    }

    // Check for existing pending invitation for this player+stable
    const existingInvitations = await dynamoDb.scanAll({
      TableName: TableNames.STABLE_INVITATIONS,
      FilterExpression: '#stableId = :stableId AND #playerId = :playerId AND #status = :pending',
      ExpressionAttributeNames: {
        '#stableId': 'stableId',
        '#playerId': 'playerId',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':stableId': stableId,
        ':playerId': playerId,
        ':pending': 'pending',
      },
    });

    if (existingInvitations.length > 0) {
      return badRequest('A pending invitation already exists for this player');
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = {
      invitationId: uuidv4(),
      stableId,
      stableName: stable.stableId, // store name for convenience
      playerId,
      invitedBy: stable.leaderId,
      message: message || undefined,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await dynamoDb.put({
      TableName: TableNames.STABLE_INVITATIONS,
      Item: invitation,
    });

    return created(invitation);
  } catch (err) {
    console.error('Error inviting to stable:', err);
    return serverError('Failed to send invitation');
  }
};
