import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotifications, CreateNotificationParams } from '../../lib/notifications';
import {
  scheduleMatchInternal,
  ScheduleMatchError,
  ScheduleMatchInput,
} from '../matches/scheduleMatch';

interface JoinQueueBody {
  matchFormat?: string;
  stipulationId?: string;
  expiresInMinutes?: number;
  championshipId?: string;
}

interface QueuePreferences {
  matchFormat?: string;
  stipulationId?: string;
}

interface QueueRow {
  playerId: string;
  joinedAt: string;
  preferences?: QueuePreferences;
  ttl: number;
}

interface PresenceRow {
  playerId: string;
  ttl?: number;
}

interface PlayerRecord {
  playerId: string;
  name: string;
  userId?: string;
}

const DEFAULT_EXPIRES_IN_MINUTES = 15;

/**
 * POST /matchmaking/queue/join
 *
 * Wrestlers opt-in to self-service matchmaking. If a compatible opponent is
 * already queued (and still online), they are paired immediately and a match
 * is scheduled. Otherwise, the caller's row is inserted into the queue with a
 * TTL. Championship matches are NOT allowed through this flow.
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can join the matchmaking queue');
    }

    const { data: body, error: parseError } = parseBody<JoinQueueBody>(event);
    if (parseError) return parseError;

    if (body.championshipId !== undefined) {
      return badRequest(
        'Championship matches cannot be scheduled via matchmaking. Use the challenge or admin scheduling flow.'
      );
    }

    const matchFormat = body.matchFormat;
    const stipulationId = body.stipulationId;
    const expiresInMinutes =
      typeof body.expiresInMinutes === 'number' && body.expiresInMinutes > 0
        ? body.expiresInMinutes
        : DEFAULT_EXPIRES_IN_MINUTES;

    // Find the caller's player record via their user sub
    const callerPlayerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayerItem = callerPlayerResult.Items?.[0] as
      | PlayerRecord
      | undefined;
    if (!callerPlayerItem) {
      return badRequest('No player profile linked to your account');
    }

    const callerPlayerId = callerPlayerItem.playerId;
    const callerUserId = callerPlayerItem.userId;

    // Presence precondition — caller must be online
    const callerPresence = await dynamoDb.get({
      TableName: TableNames.PRESENCE,
      Key: { playerId: callerPlayerId },
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const callerPresenceItem = callerPresence.Item as PresenceRow | undefined;
    if (
      !callerPresenceItem ||
      (typeof callerPresenceItem.ttl === 'number' &&
        callerPresenceItem.ttl <= nowSeconds)
    ) {
      return badRequest('You must appear online before joining the queue.');
    }

    // Scan the queue looking for a compatible opponent
    const queueItems = (await dynamoDb.scanAll({
      TableName: TableNames.MATCHMAKING_QUEUE,
    })) as unknown as QueueRow[];

    for (const candidate of queueItems) {
      if (!candidate || candidate.playerId === callerPlayerId) continue;
      if (typeof candidate.ttl !== 'number' || candidate.ttl <= nowSeconds) continue;

      // matchFormat compatibility: both unset, or exact match
      const candidateFormat = candidate.preferences?.matchFormat;
      const formatsCompatible =
        (!matchFormat && !candidateFormat) ||
        (!!matchFormat && !!candidateFormat && matchFormat === candidateFormat);
      if (!formatsCompatible) continue;

      // Cross-check candidate is still online
      const candidatePresence = await dynamoDb.get({
        TableName: TableNames.PRESENCE,
        Key: { playerId: candidate.playerId },
      });
      const candidatePresenceItem = candidatePresence.Item as
        | PresenceRow
        | undefined;
      if (
        !candidatePresenceItem ||
        (typeof candidatePresenceItem.ttl === 'number' &&
          candidatePresenceItem.ttl <= nowSeconds)
      ) {
        continue;
      }

      // Hydrate candidate player record (needed for notifications + response)
      const candidatePlayerResult = await dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId: candidate.playerId },
      });
      const candidatePlayer = candidatePlayerResult.Item as
        | PlayerRecord
        | undefined;
      if (!candidatePlayer) continue;

      // Conditionally claim the candidate's queue row
      try {
        await dynamoDb.delete({
          TableName: TableNames.MATCHMAKING_QUEUE,
          Key: { playerId: candidate.playerId },
          ConditionExpression: 'attribute_exists(playerId)',
        });
      } catch (conditionErr: unknown) {
        if (
          conditionErr instanceof Error &&
          conditionErr.name === 'ConditionalCheckFailedException'
        ) {
          // Lost the race — fall through and queue the caller instead
          break;
        }
        throw conditionErr;
      }

      // Successfully claimed — schedule the match
      const scheduleInput: ScheduleMatchInput = {
        participants: [callerPlayerId, candidate.playerId],
        date: new Date().toISOString(),
        isChampionship: false,
        matchFormat: matchFormat || 'singles',
      };
      if (stipulationId) {
        scheduleInput.stipulationId = stipulationId;
      }

      try {
        const scheduled = await scheduleMatchInternal(scheduleInput);

        // Notify both players
        const notifications: CreateNotificationParams[] = [];
        if (callerUserId) {
          notifications.push({
            userId: callerUserId,
            type: 'match_scheduled',
            sourceId: scheduled.matchId,
            sourceType: 'match',
            message: `Auto-matched with ${candidatePlayer.name}!`,
          });
        }
        if (candidatePlayer.userId) {
          notifications.push({
            userId: candidatePlayer.userId,
            type: 'match_scheduled',
            sourceId: scheduled.matchId,
            sourceType: 'match',
            message: `Auto-matched with ${callerPlayerItem.name}!`,
          });
        }
        if (notifications.length > 0) {
          await createNotifications(notifications);
        }

        return success({
          status: 'matched',
          matchId: scheduled.matchId,
          opponent: {
            playerId: candidatePlayer.playerId,
            name: candidatePlayer.name,
          },
        });
      } catch (scheduleErr: unknown) {
        if (scheduleErr instanceof ScheduleMatchError) {
          console.error(
            'Failed to schedule auto-matched game:',
            scheduleErr.message
          );
          return serverError('Failed to schedule auto-matched game');
        }
        throw scheduleErr;
      }
    }

    // No candidate (or race lost) — queue the caller (idempotent overwrite)
    const queueRow: QueueRow = {
      playerId: callerPlayerId,
      joinedAt: new Date().toISOString(),
      preferences: {
        matchFormat,
        stipulationId,
      },
      ttl: nowSeconds + expiresInMinutes * 60,
    };

    await dynamoDb.put({
      TableName: TableNames.MATCHMAKING_QUEUE,
      Item: queueRow,
    });

    return success({ status: 'queued' });
  } catch (err) {
    console.error('Error joining matchmaking queue:', err);
    return serverError('Failed to join matchmaking queue');
  }
};
