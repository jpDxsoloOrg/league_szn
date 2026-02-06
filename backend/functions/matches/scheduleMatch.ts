import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, notFound, serverError } from '../../lib/response';

interface ScheduleMatchBody {
  date: string;
  matchType: string;
  stipulation?: string;
  participants: string[];
  isChampionship: boolean;
  championshipId?: string;
  tournamentId?: string;
  seasonId?: string;
  eventId?: string;
  designation?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body: ScheduleMatchBody = JSON.parse(event.body);

    if (!body.date || !body.matchType || !body.participants || body.participants.length < 2) {
      return badRequest('Date, matchType, and at least 2 participants are required');
    }

    if (body.isChampionship && !body.championshipId) {
      return badRequest('Championship ID is required for championship matches');
    }

    // Check for duplicate participants
    const uniqueParticipants = new Set(body.participants);
    if (uniqueParticipants.size !== body.participants.length) {
      return badRequest('Duplicate participants are not allowed');
    }

    // Validate all participants exist
    const playerValidationPromises = body.participants.map(async (playerId) => {
      const player = await dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId },
      });
      return { playerId, exists: !!player.Item };
    });

    const playerResults = await Promise.all(playerValidationPromises);
    const missingPlayers = playerResults.filter((p) => !p.exists).map((p) => p.playerId);

    if (missingPlayers.length > 0) {
      return notFound(`Players not found: ${missingPlayers.join(', ')}`);
    }

    // Validate championship exists if provided
    if (body.championshipId) {
      const championship = await dynamoDb.get({
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId: body.championshipId },
      });

      if (!championship.Item) {
        return notFound(`Championship not found: ${body.championshipId}`);
      }
    }

    // Validate tournament exists if provided
    if (body.tournamentId) {
      const tournament = await dynamoDb.get({
        TableName: TableNames.TOURNAMENTS,
        Key: { tournamentId: body.tournamentId },
      });

      if (!tournament.Item) {
        return notFound(`Tournament not found: ${body.tournamentId}`);
      }

      // Ensure tournament is not completed
      if (tournament.Item.status === 'completed') {
        return badRequest('Cannot schedule match for a completed tournament');
      }
    }

    // Validate season exists and is active if provided
    if (body.seasonId) {
      const season = await dynamoDb.get({
        TableName: TableNames.SEASONS,
        Key: { seasonId: body.seasonId },
      });

      if (!season.Item) {
        return notFound(`Season not found: ${body.seasonId}`);
      }

      // Ensure season is active
      if (season.Item.status !== 'active') {
        return badRequest('Cannot schedule match for an inactive season');
      }
    }

    const match = {
      matchId: uuidv4(),
      date: body.date,
      matchType: body.matchType,
      stipulation: body.stipulation || '',
      participants: body.participants,
      isChampionship: body.isChampionship,
      championshipId: body.championshipId,
      tournamentId: body.tournamentId,
      seasonId: body.seasonId,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };

    await dynamoDb.put({
      TableName: TableNames.MATCHES,
      Item: match,
    });

    // If an event was specified, auto-add the match to the event's matchCards
    if (body.eventId) {
      const eventResult = await dynamoDb.get({
        TableName: TableNames.EVENTS,
        Key: { eventId: body.eventId },
      });

      if (eventResult.Item) {
        const existingCards = (eventResult.Item as Record<string, any>).matchCards || [];
        const newCard = {
          matchId: match.matchId,
          position: existingCards.length + 1,
          designation: body.designation || 'midcard',
        };

        await dynamoDb.update({
          TableName: TableNames.EVENTS,
          Key: { eventId: body.eventId },
          UpdateExpression: 'SET matchCards = list_append(if_not_exists(matchCards, :empty), :newCard), updatedAt = :now',
          ExpressionAttributeValues: {
            ':newCard': [newCard],
            ':empty': [],
            ':now': new Date().toISOString(),
          },
        });
      }
    }

    return created(match);
  } catch (err) {
    console.error('Error scheduling match:', err);
    return serverError('Failed to schedule match');
  }
};
