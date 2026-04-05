import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError, forbidden } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { createNotification, createNotifications } from '../../lib/notifications';

interface RespondBody {
  response?: 'accepted' | 'declined';
  declineReason?: string;
  // Legacy fields (still accepted for backward-compat with older clients)
  action?: 'accept' | 'decline';
  responseMessage?: string;
}

interface ResponseRecord {
  status: 'pending' | 'accepted' | 'declined';
  declineReason?: string;
}

/**
 * Compute the target show date for an auto-scheduled challenge match.
 * - If accepted on Sunday, advance to Monday.
 * - Otherwise, next calendar day.
 */
function computeFallbackDate(now: Date): string {
  const target = new Date(now);
  const day = now.getDay(); // 0 = Sunday
  if (day === 0) {
    target.setDate(target.getDate() + 1); // Monday
  } else {
    target.setDate(target.getDate() + 1);
  }
  target.setHours(20, 0, 0, 0);
  return target.toISOString();
}

function earliestEligibleIso(now: Date): string {
  // Must be on Monday or later if accepted on Sunday — i.e. strictly after Sunday.
  const base = new Date(now);
  const day = now.getDay();
  if (day === 0) {
    base.setDate(base.getDate() + 1); // Monday
    base.setHours(0, 0, 0, 0);
  }
  return base.toISOString();
}

async function findNextUpcomingEvent(minDateIso: string): Promise<Record<string, unknown> | null> {
  try {
    const result = await dynamoDb.query({
      TableName: TableNames.EVENTS,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#s = :st AND #d >= :minDate',
      ExpressionAttributeNames: { '#s': 'status', '#d': 'date' },
      ExpressionAttributeValues: { ':st': 'upcoming', ':minDate': minDateIso },
      ScanIndexForward: true,
      Limit: 1,
    });
    const item = result.Items?.[0];
    return item ? (item as Record<string, unknown>) : null;
  } catch (err) {
    console.error('Failed to query upcoming events:', err);
    return null;
  }
}

async function autoScheduleMatch(
  challenge: Record<string, unknown>,
  challengerId: string,
  opponentIds: string[],
  now: Date,
): Promise<{ matchId: string; eventId?: string; eventName?: string; date: string }> {
  // Find next eligible event date
  const minDateIso = earliestEligibleIso(now);
  const nextEvent = await findNextUpcomingEvent(minDateIso);

  const eventId = nextEvent?.eventId as string | undefined;
  const eventName = nextEvent?.name as string | undefined;
  const targetDate = (nextEvent?.date as string | undefined) || computeFallbackDate(now);

  const matchId = uuidv4();
  const nowIso = now.toISOString();
  const match: Record<string, unknown> = {
    matchId,
    date: targetDate,
    matchFormat: challenge.matchType as string,
    participants: [challengerId, ...opponentIds],
    isChampionship: false,
    status: 'scheduled',
    designation: 'pre-show',
    challengeId: challenge.challengeId as string,
    createdAt: nowIso,
  };
  if (eventId) match.eventId = eventId;
  if (challenge.stipulation) match.stipulation = challenge.stipulation as string;

  await dynamoDb.put({
    TableName: TableNames.MATCHES,
    Item: match,
  });

  // If event found, append to its matchCards
  if (eventId && nextEvent) {
    try {
      const existingCards = (nextEvent.matchCards as unknown[] | undefined) || [];
      const newCard = {
        matchId,
        position: existingCards.length + 1,
        designation: 'pre-show',
      };
      await dynamoDb.update({
        TableName: TableNames.EVENTS,
        Key: { eventId },
        UpdateExpression:
          'SET matchCards = list_append(if_not_exists(matchCards, :empty), :newCard), updatedAt = :now',
        ExpressionAttributeValues: {
          ':newCard': [newCard],
          ':empty': [],
          ':now': nowIso,
        },
      });
    } catch (err) {
      console.error('Failed to append match to event matchCards:', err);
    }
  }

  return { matchId, eventId, eventName, date: targetDate };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can respond to challenges');
    }

    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return badRequest('challengeId is required');
    }

    if (!event.body) {
      return badRequest('Request body is required');
    }

    let body: RespondBody;
    try {
      body = JSON.parse(event.body) as RespondBody;
    } catch {
      return badRequest('Invalid JSON in request body');
    }

    // Normalize body — accept either new `response` field or legacy `action`.
    let responseValue: 'accepted' | 'declined' | undefined = body.response;
    if (!responseValue && body.action) {
      responseValue = body.action === 'accept' ? 'accepted' : body.action === 'decline' ? 'declined' : undefined;
    }
    const declineReason = body.declineReason;

    if (!responseValue || !['accepted', 'declined'].includes(responseValue)) {
      return badRequest('response must be accepted or declined');
    }

    if (responseValue === 'declined' && !declineReason) {
      return badRequest('declineReason is required when declining');
    }

    // Fetch challenge
    const result = await dynamoDb.get({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId },
    });
    const challenge = result.Item as Record<string, unknown> | undefined;
    if (!challenge) {
      return notFound('Challenge not found');
    }

    if (challenge.status !== 'pending') {
      return badRequest('Challenge is no longer pending');
    }

    // Verify the responder
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });
    const responderPlayer = playerResult.Items?.[0] as Record<string, unknown> | undefined;
    if (!responderPlayer) {
      return forbidden('Only the challenged player can respond');
    }
    const responderId = responderPlayer.playerId as string;
    const responderName = (responderPlayer.currentWrestler as string) || (responderPlayer.name as string) || 'A wrestler';

    const now = new Date();
    const nowIso = now.toISOString();

    // --- Tag team path (simple accept/decline; no auto-schedule) ---
    if (challenge.challengeMode === 'tag_team') {
      const tagTeamResult = await dynamoDb.get({
        TableName: TableNames.TAG_TEAMS,
        Key: { tagTeamId: challenge.challengedTagTeamId as string },
      });
      const tagTeam = tagTeamResult.Item as Record<string, unknown> | undefined;
      if (!tagTeam || tagTeam.status !== 'active') {
        return badRequest('The challenged tag team has been dissolved');
      }
      if (responderId !== tagTeam.player1Id && responderId !== tagTeam.player2Id) {
        return forbidden('Only members of the challenged tag team can respond');
      }

      const newStatus = responseValue === 'accepted' ? 'accepted' : 'declined';
      const exprValues: Record<string, unknown> = {
        ':status': newStatus,
        ':now': nowIso,
      };
      let updateExpr = 'SET #s = :status, updatedAt = :now';
      if (declineReason) {
        updateExpr += ', declineReason = :dr';
        exprValues[':dr'] = declineReason;
      }

      await dynamoDb.update({
        TableName: TableNames.CHALLENGES,
        Key: { challengeId },
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: exprValues,
      });

      return success({ ...challenge, status: newStatus, declineReason, updatedAt: nowIso });
    }

    // --- Singles / multi-opponent path ---
    const opponentIds: string[] =
      (challenge.opponentIds as string[] | undefined) ||
      (challenge.challengedId ? [challenge.challengedId as string] : []);

    if (!opponentIds.includes(responderId)) {
      return forbidden('Only the challenged player can respond');
    }

    // Normalize responses map (fallback for legacy records)
    const responses: Record<string, ResponseRecord> = {
      ...(challenge.responses as Record<string, ResponseRecord> | undefined ||
        Object.fromEntries(opponentIds.map((id) => [id, { status: 'pending' as const }]))),
    };

    if (responses[responderId]?.status !== 'pending') {
      return badRequest('You have already responded to this challenge');
    }

    responses[responderId] = {
      status: responseValue,
      ...(declineReason ? { declineReason } : {}),
    };

    const statusList = Object.values(responses).map((r) => r.status);
    const anyPending = statusList.some((s) => s === 'pending');
    const anyDeclined = statusList.some((s) => s === 'declined');
    const anyAccepted = statusList.some((s) => s === 'accepted');
    const allAccepted = statusList.every((s) => s === 'accepted');

    const challengerId = challenge.challengerId as string;
    const challengerResult = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId: challengerId },
    });
    const challengerPlayer = challengerResult.Item as Record<string, unknown> | undefined;
    const challengerUserId = challengerPlayer?.userId as string | undefined;

    // Case: all accepted → auto-schedule match
    if (allAccepted) {
      const scheduled = await autoScheduleMatch(challenge, challengerId, opponentIds, now);

      await dynamoDb.update({
        TableName: TableNames.CHALLENGES,
        Key: { challengeId },
        UpdateExpression:
          'SET #s = :status, responses = :r, matchId = :mid, scheduledEventId = :eid, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':status': 'auto_scheduled',
          ':r': responses,
          ':mid': scheduled.matchId,
          ':eid': scheduled.eventId || null,
          ':now': nowIso,
        },
      });

      // Notify all participants
      const participantIds = [challengerId, ...opponentIds];
      const playerLookups = await Promise.all(
        participantIds.map((pid) =>
          dynamoDb.get({ TableName: TableNames.PLAYERS, Key: { playerId: pid } })
        )
      );
      const scheduleMessage = scheduled.eventName
        ? `Your challenge match has been scheduled for ${scheduled.eventName} (Pre-Show)`
        : 'Your challenge match has been auto-scheduled as a Pre-Show match';
      const notifications = playerLookups
        .map((r) => r.Item as Record<string, unknown> | undefined)
        .filter((p): p is Record<string, unknown> => !!p?.userId)
        .map((p) => ({
          userId: p.userId as string,
          type: 'challenge_scheduled' as const,
          message: scheduleMessage,
          sourceId: scheduled.matchId,
          sourceType: 'match' as const,
        }));
      if (notifications.length > 0) {
        await createNotifications(notifications);
      }

      return success({
        ...challenge,
        status: 'auto_scheduled',
        responses,
        matchId: scheduled.matchId,
        scheduledEventId: scheduled.eventId,
        matchDate: scheduled.date,
        eventName: scheduled.eventName,
        updatedAt: nowIso,
      });
    }

    // Case: all responded (no pending) with at least one decline
    if (!anyPending && anyDeclined) {
      const newStatus = anyAccepted ? 'partially_declined' : 'declined';
      await dynamoDb.update({
        TableName: TableNames.CHALLENGES,
        Key: { challengeId },
        UpdateExpression: 'SET #s = :status, responses = :r, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':status': newStatus,
          ':r': responses,
          ':now': nowIso,
        },
      });

      if (challengerUserId) {
        await createNotification({
          userId: challengerUserId,
          type: 'challenge_declined',
          message: `${responderName} declined your challenge${declineReason ? `: "${declineReason}"` : ''}`,
          sourceId: challengeId,
          sourceType: 'challenge',
        });
      }

      return success({ ...challenge, status: newStatus, responses, updatedAt: nowIso });
    }

    // Otherwise: still pending responses from others — just update the responses map.
    await dynamoDb.update({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId },
      UpdateExpression: 'SET responses = :r, updatedAt = :now',
      ExpressionAttributeValues: { ':r': responses, ':now': nowIso },
    });

    if (challengerUserId) {
      const notifType = responseValue === 'accepted' ? 'challenge_accepted' : 'challenge_declined';
      const verb = responseValue === 'accepted' ? 'accepted' : 'declined';
      const msg = `${responderName} ${verb} your challenge${
        responseValue === 'declined' && declineReason ? `: "${declineReason}"` : ''
      }`;
      await createNotification({
        userId: challengerUserId,
        type: notifType,
        message: msg,
        sourceId: challengeId,
        sourceType: 'challenge',
      });
    }

    return success({ ...challenge, status: 'pending', responses, updatedAt: nowIso });
  } catch (err) {
    console.error('Error responding to challenge:', err);
    return serverError('Failed to respond to challenge');
  }
};
