import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, notFound, serverError, error as errorResponse } from '../../lib/response';
import { createNotifications } from '../../lib/notifications';
import { parseBody } from '../../lib/parseBody';

export interface ScheduleMatchInput {
  date?: string;
  matchFormat: string; // "singles", "tag", "triple-threat", etc.
  stipulationId?: string;
  participants: string[];
  teams?: string[][];
  isChampionship: boolean;
  championshipId?: string;
  tournamentId?: string;
  seasonId?: string;
  eventId?: string;
  designation?: string;
  challengeId?: string;
  promoId?: string;
}

export interface ScheduleMatchResult {
  matchId: string;
  date: string;
  matchFormat: string;
  stipulationId?: string;
  participants: string[];
  teams?: string[][];
  isChampionship: boolean;
  championshipId?: string;
  tournamentId?: string;
  seasonId?: string;
  eventId?: string;
  challengeId?: string;
  promoId?: string;
  status: 'scheduled';
  createdAt: string;
}

/**
 * Error thrown by scheduleMatchInternal when validation fails or a referenced
 * resource cannot be found. Carries an HTTP-style status code so callers
 * (including the Lambda HTTP handler) can translate it back to a response.
 */
export class ScheduleMatchError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ScheduleMatchError';
    this.statusCode = statusCode;
  }
}

/**
 * Core "schedule a match" logic, decoupled from API Gateway. Call this from
 * any handler (HTTP, matchmaking, etc.) that needs to create a match row
 * with all the associated side effects (event linking, challenge/promo
 * updates, participant notifications).
 *
 * Throws ScheduleMatchError on validation failures. The caller is responsible
 * for authorisation and for translating errors into transport-appropriate
 * responses.
 */
export async function scheduleMatchInternal(
  input: ScheduleMatchInput,
): Promise<ScheduleMatchResult> {
  if (!input.matchFormat || !input.participants || input.participants.length < 2) {
    throw new ScheduleMatchError(400, 'matchFormat and at least 2 participants are required');
  }

  // Resolve date: use provided date, or event date if eventId given, or today
  let resolvedDate = input.date;
  if (!resolvedDate && input.eventId) {
    const eventForDate = await dynamoDb.get({
      TableName: TableNames.EVENTS,
      Key: { eventId: input.eventId },
    });
    if (eventForDate.Item) {
      resolvedDate = (eventForDate.Item as Record<string, unknown>).date as string;
    }
  }
  if (!resolvedDate) {
    resolvedDate = new Date().toISOString();
  }

  if (input.isChampionship && !input.championshipId) {
    throw new ScheduleMatchError(400, 'Championship ID is required for championship matches');
  }

  // Check for duplicate participants
  const uniqueParticipants = new Set(input.participants);
  if (uniqueParticipants.size !== input.participants.length) {
    throw new ScheduleMatchError(400, 'Duplicate participants are not allowed');
  }

  // Validate all participants exist
  const playerValidationPromises = input.participants.map(async (playerId) => {
    const player = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
    });
    return { playerId, exists: !!player.Item, player: player.Item };
  });

  const playerResults = await Promise.all(playerValidationPromises);
  const missingPlayers = playerResults.filter((p) => !p.exists).map((p) => p.playerId);

  if (missingPlayers.length > 0) {
    throw new ScheduleMatchError(404, `Players not found: ${missingPlayers.join(', ')}`);
  }

  // Validate championship exists if provided
  if (input.championshipId) {
    const championship = await dynamoDb.get({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId: input.championshipId },
    });

    if (!championship.Item) {
      throw new ScheduleMatchError(404, `Championship not found: ${input.championshipId}`);
    }

    // Enforce division restriction: all participants must belong to the championship's division
    const champDivisionId = championship.Item.divisionId as string | undefined;
    if (champDivisionId) {
      const wrongDivision = playerResults.filter((p) => {
        const playerDivision = (p.player as Record<string, unknown>)?.divisionId as string | undefined;
        return playerDivision !== champDivisionId;
      });

      if (wrongDivision.length > 0) {
        throw new ScheduleMatchError(
          400,
          `Championship is locked to a division. The following participants are not in the correct division: ${wrongDivision.map((p) => p.playerId).join(', ')}`,
        );
      }
    }
  }

  // Validate tournament exists if provided
  if (input.tournamentId) {
    const tournament = await dynamoDb.get({
      TableName: TableNames.TOURNAMENTS,
      Key: { tournamentId: input.tournamentId },
    });

    if (!tournament.Item) {
      throw new ScheduleMatchError(404, `Tournament not found: ${input.tournamentId}`);
    }

    if (tournament.Item.status === 'completed') {
      throw new ScheduleMatchError(400, 'Cannot schedule match for a completed tournament');
    }
  }

  // Validate season exists and is active if provided
  if (input.seasonId) {
    const season = await dynamoDb.get({
      TableName: TableNames.SEASONS,
      Key: { seasonId: input.seasonId },
    });

    if (!season.Item) {
      throw new ScheduleMatchError(404, `Season not found: ${input.seasonId}`);
    }

    if (season.Item.status !== 'active') {
      throw new ScheduleMatchError(400, 'Cannot schedule match for an inactive season');
    }
  }

  // Validate stipulationId exists if provided
  if (input.stipulationId) {
    const stipulation = await dynamoDb.get({
      TableName: TableNames.STIPULATIONS,
      Key: { stipulationId: input.stipulationId },
    });

    if (!stipulation.Item) {
      throw new ScheduleMatchError(404, `Stipulation not found: ${input.stipulationId}`);
    }
  }

  const now = new Date().toISOString();
  const match: Record<string, unknown> = {
    matchId: uuidv4(),
    date: resolvedDate,
    matchFormat: input.matchFormat,
    stipulationId: input.stipulationId,
    participants: input.participants,
    isChampionship: input.isChampionship,
    championshipId: input.championshipId,
    tournamentId: input.tournamentId,
    seasonId: input.seasonId,
    status: 'scheduled',
    createdAt: now,
  };
  if (input.eventId) match.eventId = input.eventId;
  if (input.teams && input.teams.length > 0) match.teams = input.teams;
  if (input.challengeId) match.challengeId = input.challengeId;
  if (input.promoId) match.promoId = input.promoId;

  await dynamoDb.put({
    TableName: TableNames.MATCHES,
    Item: match,
  });

  // If challengeId provided, mark challenge as scheduled and link match
  if (input.challengeId) {
    const challengeResult = await dynamoDb.get({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId: input.challengeId },
    });
    const challenge = challengeResult.Item as Record<string, unknown> | undefined;
    if (challenge && ['pending', 'countered', 'accepted'].includes(challenge.status as string)) {
      await dynamoDb.update({
        TableName: TableNames.CHALLENGES,
        Key: { challengeId: input.challengeId },
        UpdateExpression: 'SET #s = :status, matchId = :matchId, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':status': 'scheduled',
          ':matchId': match.matchId,
          ':now': now,
        },
      });
    }
  }

  // If promoId provided, hide promo and optionally link match (scheduling from call-out auto-hides it)
  if (input.promoId) {
    const promoResult = await dynamoDb.get({
      TableName: TableNames.PROMOS,
      Key: { promoId: input.promoId },
    });
    if (promoResult.Item) {
      await dynamoDb.update({
        TableName: TableNames.PROMOS,
        Key: { promoId: input.promoId },
        UpdateExpression: 'SET isHidden = :hidden, matchId = :matchId, updatedAt = :now',
        ExpressionAttributeValues: {
          ':hidden': true,
          ':matchId': match.matchId,
          ':now': now,
        },
      });
    }
  }

  // If an event was specified, auto-add the match to the event's matchCards
  if (input.eventId) {
    const eventResult = await dynamoDb.get({
      TableName: TableNames.EVENTS,
      Key: { eventId: input.eventId },
    });

    if (eventResult.Item) {
      const existingCards = ((eventResult.Item as Record<string, unknown>).matchCards as unknown[] | undefined) || [];
      const newCard = {
        matchId: match.matchId as string,
        position: existingCards.length + 1,
        designation: input.designation || 'midcard',
      };

      await dynamoDb.update({
        TableName: TableNames.EVENTS,
        Key: { eventId: input.eventId },
        UpdateExpression: 'SET matchCards = list_append(if_not_exists(matchCards, :empty), :newCard), updatedAt = :now',
        ExpressionAttributeValues: {
          ':newCard': [newCard],
          ':empty': [],
          ':now': new Date().toISOString(),
        },
      });
    }
  }

  // Notify all participants who have linked user accounts
  const notificationParams = playerResults
    .filter((p) => {
      const playerRecord = p.player as Record<string, unknown> | undefined;
      return playerRecord?.userId;
    })
    .map((p) => {
      const playerRecord = p.player as Record<string, unknown>;
      return {
        userId: playerRecord.userId as string,
        type: 'match_scheduled' as const,
        message: `You've been scheduled in a ${input.matchFormat} match`,
        sourceId: match.matchId as string,
        sourceType: 'match' as const,
      };
    });

  if (notificationParams.length > 0) {
    await createNotifications(notificationParams);
  }

  return match as unknown as ScheduleMatchResult;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody<ScheduleMatchInput>(event);
    if (parseError) return parseError;

    const result = await scheduleMatchInternal(body);
    return created(result);
  } catch (err) {
    if (err instanceof ScheduleMatchError) {
      if (err.statusCode === 400) return badRequest(err.message);
      if (err.statusCode === 404) return notFound(err.message);
      return errorResponse(err.statusCode, err.message);
    }
    console.error('Error scheduling match:', err);
    return serverError('Failed to schedule match');
  }
};
