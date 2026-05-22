import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotifications } from '../../lib/notifications';
import type {
  Rivalry,
  RivalryMessage,
  RivalryPatch,
  RivalryStatus,
} from '../../lib/repositories';

type RespondAction = 'approve' | 'reject' | 'conclude';

interface RespondBody {
  action?: RespondAction;
  message?: string;
}

const VALID_ACTIONS: ReadonlyArray<RespondAction> = ['approve', 'reject', 'conclude'];

/**
 * GM-only POST /rivalry-requests/{rivalryId}/respond.
 *
 * Updates the rivalry status, appends a system message, and dispatches
 * notifications to participants. The status update + system message are
 * staged on a single UnitOfWork so the message can never appear without
 * the corresponding status change.
 *
 * Notifications fire after commit (they have their own retry semantics
 * via createNotifications' Promise.allSettled).
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const rivalryId = event.pathParameters?.rivalryId;
    if (!rivalryId) return badRequest('rivalryId is required');

    const parsed = parseBody<RespondBody>(event);
    if (parsed.error) return parsed.error;
    const { action, message } = parsed.data;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return badRequest(`action must be one of: ${VALID_ACTIONS.join(', ')}`);
    }
    if (action === 'reject' && (!message || message.trim().length === 0)) {
      return badRequest('message is required when rejecting a rivalry');
    }

    const { rivalries, roster: { players }, runInTransaction } = getRepositories();
    const rivalry = await rivalries.get(rivalryId);
    if (!rivalry) return notFound('Rivalry not found');

    const transition = computeTransition(rivalry, action);
    if (!transition) {
      return badRequest(
        `Cannot ${action} a rivalry with status '${rivalry.status}'`,
      );
    }

    const now = new Date().toISOString();
    const auth = getAuthContext(event);
    const moderator = auth.username || auth.email || 'admin';

    const patch: RivalryPatch = {
      status: transition.nextStatus,
      moderatedBy: moderator,
    };
    if (action === 'approve') patch.startedAt = now;
    if (action === 'conclude') patch.endedAt = now;
    if (action === 'reject' && message) patch.moderationNote = message.trim();

    const systemMessage: RivalryMessage = {
      rivalryId,
      messageId: uuidv4(),
      authorPlayerId: 'system',
      body: buildSystemMessage(action, moderator, message),
      // System status transitions are public — participants and observers
      // both need to see them so 'all' is correct.
      audience: 'all',
      createdAt: now,
    };

    await runInTransaction(async (tx) => {
      tx.updateRivalry(rivalryId, patch);
      tx.appendRivalryMessage(systemMessage);
    });

    // Notify each participant who has a linked user account.
    const participantPlayers = await Promise.all(
      rivalry.participants.map((p) => players.findById(p.playerId)),
    );
    const notifications = participantPlayers
      .filter((p): p is NonNullable<typeof p> => !!p && !!p.userId)
      .map((p) => ({
        userId: p.userId as string,
        type: 'rivalry_reviewed' as const,
        message: buildNotificationMessage(action, rivalry, moderator),
        sourceId: rivalryId,
        sourceType: 'rivalry' as const,
      }));
    await createNotifications(notifications);

    const updated = await rivalries.get(rivalryId);
    return success({
      rivalry: updated,
      systemMessage,
    });
  } catch (err) {
    console.error('Error responding to rivalry:', err);
    return serverError('Failed to respond to rivalry');
  }
};

interface Transition {
  nextStatus: RivalryStatus;
}

function computeTransition(rivalry: Rivalry, action: RespondAction): Transition | null {
  switch (action) {
    case 'approve':
      return rivalry.status === 'pending' ? { nextStatus: 'active' } : null;
    case 'reject':
      return rivalry.status === 'pending' ? { nextStatus: 'rejected' } : null;
    case 'conclude':
      return rivalry.status === 'active' ? { nextStatus: 'completed' } : null;
  }
}

function buildSystemMessage(
  action: RespondAction,
  moderator: string,
  message?: string,
): string {
  const trimmed = message?.trim();
  switch (action) {
    case 'approve':
      return trimmed
        ? `Rivalry approved by ${moderator}. ${trimmed}`
        : `Rivalry approved by ${moderator}.`;
    case 'reject':
      return `Rivalry rejected by ${moderator}.`;
    case 'conclude':
      return trimmed
        ? `Rivalry concluded by ${moderator}. ${trimmed}`
        : `Rivalry concluded by ${moderator}.`;
  }
}

function buildNotificationMessage(
  action: RespondAction,
  rivalry: Rivalry,
  moderator: string,
): string {
  const title = rivalry.title;
  switch (action) {
    case 'approve':
      return `Your rivalry "${title}" was approved by ${moderator}.`;
    case 'reject':
      return `Your rivalry "${title}" was rejected by ${moderator}.`;
    case 'conclude':
      return `Your rivalry "${title}" has been concluded by ${moderator}.`;
  }
}
