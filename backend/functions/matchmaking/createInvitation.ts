import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, forbidden, notFound, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotification } from '../../lib/notifications';
import type { InvitationRecord } from '../../lib/repositories/MatchmakingRepository';

interface CreateInvitationBody {
  targetPlayerId?: string;
  matchFormat?: string;
  stipulationId?: string;
  championshipId?: string;
}

const INVITATION_TTL_SECONDS = 5 * 60;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can send match invitations');
    }

    const { players, matchmaking } = getRepositories();

    // Find the caller's player record via their user sub
    const callerPlayer = await players.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }
    const caller = callerPlayer;

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
    const callerPresence = await matchmaking.getPresence(caller.playerId);
    if (!callerPresence || callerPresence.ttl <= nowSeconds) {
      return badRequest('You must appear online before inviting');
    }

    // Target player must exist
    const target = await players.findById(targetPlayerId);
    if (!target) {
      return notFound('Target player not found');
    }

    // Target must have an active presence row
    const targetPresence = await matchmaking.getPresence(targetPlayerId);
    if (!targetPresence || targetPresence.ttl <= nowSeconds) {
      return badRequest('Target player is not online');
    }

    // Reject duplicate pending invitations from caller -> target
    const existingItems = await matchmaking.listInvitationsByToPlayer(targetPlayerId);
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

    const invitation: InvitationRecord = {
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

    await matchmaking.putInvitation(invitation);

    // Notify the target if they have a linked user account
    const targetRecord = target as unknown as Record<string, unknown>;
    if (targetRecord.userId) {
      await createNotification({
        userId: targetRecord.userId as string,
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
