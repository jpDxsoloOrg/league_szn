import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from './dynamodb';

export type NotificationType =
  | 'promo_mention'
  | 'challenge_received'
  | 'match_scheduled'
  | 'announcement'
  | 'stable_invitation'
  | 'tag_team_invitation'
  | 'tag_team_formed'
  | 'transfer_reviewed'
  | 'storyline_request'
  | 'storyline_request_reviewed'
  // ECO-09
  | 'gm_interference_requested'
  | 'gm_interference_resolved'
  | 'rivalry_reviewed'
  | 'rivalry_message'
  | 'rivalry_request'
  | 'rivalry_status_change'
  | 'strike_issued'
  | 'strike_removed'
  | 'account_reactivated'
  // ECO-04: contract offers
  | 'contract_offer'
  | 'contract_offer_accepted'
  | 'contract_offer_declined'
  | 'contract_offer_expired'
  | 'contract_released'
  // ECO-05: a tryout / match contract ran its course
  | 'contract_completed'

  // INJ-05: the weekly recovery ended an injury
  | 'injury_recovered'

  // ECO-07
  | 'no_show_marked'
  | 'fine_issued'
  | 'fine_rescinded'
  | 'balance_negative'
  | 'progression_consideration'
  | 'progression_executed'
  | 'progression_milestone'
  | 'progression_goals_reset'
  // INJ-04: a recorded result injured the player
  | 'injury_sustained'
  // BLD-04: a division move left the build over a smaller budget
  | 'build_over_budget';

/** Set of notification types scoped to a rivalry source. */
export type RivalryNotificationType =
  | 'rivalry_message'
  | 'rivalry_request'
  | 'rivalry_status_change'
  | 'rivalry_reviewed';

export type NotificationSourceType = 'promo' | 'challenge' | 'contract' | 'match' | 'announcement' | 'stable' | 'tag_team' | 'transfer' | 'storyline_request' | 'rivalry' | 'discipline' | 'progression' | 'economy' | 'build'
  // INJ-05
  | 'injury';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  message: string;
  sourceId: string;
  sourceType: NotificationSourceType;
}

const TTL_DAYS = 30;

/**
 * Creates a single notification for a user.
 * Failures are caught and logged — they never break the calling handler.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const now = new Date().toISOString();
    const notificationId = uuidv4();

    await dynamoDb.put({
      TableName: TableNames.NOTIFICATIONS,
      Item: {
        userId: params.userId,
        notificationId,
        type: params.type,
        message: params.message,
        sourceId: params.sourceId,
        sourceType: params.sourceType,
        isRead: false,
        createdAt: now,
        updatedAt: now,
        ttl: Math.floor(Date.now() / 1000) + TTL_DAYS * 24 * 60 * 60,
      },
    });
  } catch (error: unknown) {
    console.error('Failed to create notification:', error);
  }
}

/**
 * Creates notifications for multiple users in parallel.
 * Uses Promise.allSettled so individual failures don't affect others.
 * Failures are caught and logged — they never break the calling handler.
 */
export async function createNotifications(params: CreateNotificationParams[]): Promise<void> {
  try {
    await Promise.allSettled(params.map((param) => createNotification(param)));
  } catch (error: unknown) {
    console.error('Failed to create bulk notifications:', error);
  }
}

/**
 * Convenience for rivalry-sourced notifications. Centralises the
 * sourceType so callers don't drift on naming.
 */
export function createRivalryNotification(
  rivalryId: string,
  recipientUserId: string,
  type: RivalryNotificationType,
  message: string,
): Promise<void> {
  return createNotification({
    userId: recipientUserId,
    type,
    message,
    sourceId: rivalryId,
    sourceType: 'rivalry',
  });
}
