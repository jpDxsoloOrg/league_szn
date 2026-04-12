import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, forbidden, notFound, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotification } from '../../lib/notifications';

interface CreateInvitationBody {
  targetPlayerId?: string;
  matchFormat?: string;
  stipulationId?: string;
  championshipId?: string;
}

interface PlayerRecord {
  playerId: string;
  userId?: string;
  name: string;
}

interface PresenceRecord {
  playerId: string;
  lastSeenAt: string;
  ttl: number;
}

interface InvitationRow {
  invitationId: string;
  fromPlayerId: string;
  toPlayerId: string;
  matchFormat?: string;
  stipulationId?: string;
  status: 'pending';
  createdAt: string;
  expiresAt: string;
  ttl: number;
}

const INVITATION_TTL_SECONDS = 5 * 60;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can send match invitations');
    }

    // Find the caller's player record via their user sub
    const callerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerItem = callerResult.Items?.[0];
    if (!callerItem) {
      return badRequest('No player profile linked to your account');
    }
    const caller = callerItem as unknown as PlayerRecord;

    const { data: body, error: parseError } = parseBody<CreateInvitationBody>(event);
    if (parseError) return parseError;

    if (body.championshipId !== undefined) {
      return badRequest(
        'Championship matches cannot be scheduled via matchmaking. Use the challenge or admin scheduling flow.'
      );
    }

    const { targetPlayerId, matchFormat, stipulationId } = body;
    if (!targetPlayerId) {
      return badRequest('targetPlayerId is required');
    }

    if (targetPlayerId === caller.playerId) {
      return badRequest('Cannot invite yourself');
    }

    const nowMs = Date.now();
    const nowSeconds = Math.floor(nowMs / 1000);
    const nowIso = new Date(nowMs).toISOString();

    // Caller must have an active presence row
    const callerPresenceResult = await dynamoDb.get({
      TableName: TableNames.PRESENCE,
      Key: { playerId: caller.playerId },
    });
    const callerPresence = callerPresenceResult.Item as PresenceRecord | undefined;
    if (!callerPresence || callerPresence.ttl <= nowSeconds) {
      return badRequest('You must appear online before inviting');
    }

    // Target player must exist
    const targetResult = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId: targetPlayerId },
    });
    if (!targetResult.Item) {
      return notFound('Target player not found');
    }
    const target = targetResult.Item as unknown as PlayerRecord;

    // Target must have an active presence row
    const targetPresenceResult = await dynamoDb.get({
      TableName: TableNames.PRESENCE,
      Key: { playerId: targetPlayerId },
    });
    const targetPresence = targetPresenceResult.Item as PresenceRecord | undefined;
    if (!targetPresence || targetPresence.ttl <= nowSeconds) {
      return badRequest('Target player is not online');
    }

    // Reject duplicate pending invitations from caller -> target
    const existingResult = await dynamoDb.query({
      TableName: TableNames.MATCH_INVITATIONS,
      IndexName: 'ToPlayerIndex',
      KeyConditionExpression: 'toPlayerId = :tid',
      ExpressionAttributeValues: { ':tid': targetPlayerId },
    });

    const existingItems = (existingResult.Items ?? []) as unknown as InvitationRow[];
    const hasPending = existingItems.some(
      (inv) =>
        inv.fromPlayerId === caller.playerId &&
        inv.status === 'pending' &&
        inv.expiresAt > nowIso
    );
    if (hasPending) {
      return badRequest('Invitation already pending');
    }

    // Create the invitation
    const invitationId = uuidv4();
    const expiresAt = new Date(nowMs + INVITATION_TTL_SECONDS * 1000).toISOString();
    const ttl = nowSeconds + INVITATION_TTL_SECONDS;

    const invitation: InvitationRow = {
      invitationId,
      fromPlayerId: caller.playerId,
      toPlayerId: targetPlayerId,
      status: 'pending',
      createdAt: nowIso,
      expiresAt,
      ttl,
      ...(matchFormat !== undefined ? { matchFormat } : {}),
      ...(stipulationId !== undefined ? { stipulationId } : {}),
    };

    await dynamoDb.put({
      TableName: TableNames.MATCH_INVITATIONS,
      Item: invitation,
    });

    // Notify the target if they have a linked user account
    if (target.userId) {
      await createNotification({
        userId: target.userId,
        type: 'match_invitation',
        sourceId: invitationId,
        sourceType: 'match_invitation',
        message: `${caller.name} invited you to a match!`,
      });
    }

    return created(invitation);
  } catch (err) {
    console.error('Error creating match invitation:', err);
    return serverError('Failed to create match invitation');
  }
};
