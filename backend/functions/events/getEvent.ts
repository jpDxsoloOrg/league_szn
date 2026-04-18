import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;

    if (!eventId) {
      return badRequest('Event ID is required');
    }

    const { events, players, stipulations } = getRepositories();

    // Get the event
    const eventItem = await events.findById(eventId);

    if (!eventItem) {
      return notFound('Event not found');
    }

    const matchCards = eventItem.matchCards || [];

    // Build enrichedMatches array matching the EventWithMatches frontend type
    const enrichedMatches = await Promise.all(
      matchCards.map(async (card) => {
        if (!card.matchId) {
          return {
            position: card.position,
            matchId: card.matchId,
            designation: card.designation,
            notes: card.notes,
            matchData: null,
          };
        }

        // Note: Matches table not yet migrated to repository layer (Wave 5+)
        const matchQuery = await dynamoDb.query({
          TableName: TableNames.MATCHES,
          KeyConditionExpression: 'matchId = :matchId',
          ExpressionAttributeValues: { ':matchId': card.matchId },
          Limit: 1,
        });

        if (!matchQuery.Items || matchQuery.Items.length === 0) {
          return {
            position: card.position,
            matchId: card.matchId,
            designation: card.designation,
            notes: card.notes,
            matchData: null,
          };
        }

        const match = matchQuery.Items[0] as Record<string, unknown>;

        // Fetch participant player data via repository
        const participants: { playerId: string; playerName: string; wrestlerName: string }[] = [];
        if (Array.isArray(match.participants) && match.participants.length > 0) {
          const playerPromises = (match.participants as string[]).map(async (playerId: string) => {
            const player = await players.findById(playerId);
            return {
              playerId,
              playerName: player?.name || 'Unknown Player',
              wrestlerName: player?.currentWrestler || 'Unknown Wrestler',
            };
          });
          participants.push(...(await Promise.all(playerPromises)));
        }

        // Note: Championships table not yet migrated to repository layer (Wave 5+)
        let championshipName: string | undefined;
        if (match.isChampionship && match.championshipId) {
          const championshipResult = await dynamoDb.get({
            TableName: TableNames.CHAMPIONSHIPS,
            Key: { championshipId: match.championshipId },
          });
          const championship = championshipResult.Item as Record<string, unknown> | undefined;
          championshipName = championship?.name as string | undefined;
        }

        // Fetch stipulation name via repository
        let stipulationName: string | undefined;
        if (match.stipulationId) {
          const stipulation = await stipulations.findById(match.stipulationId as string);
          stipulationName = stipulation?.name;
        }

        return {
          position: card.position,
          matchId: card.matchId,
          designation: card.designation,
          notes: card.notes,
          matchData: {
            matchId: match.matchId,
            matchFormat: match.matchFormat,
            stipulationId: match.stipulationId,
            stipulationName,
            participants,
            winners: match.winners,
            losers: match.losers,
            isChampionship: match.isChampionship || false,
            championshipName,
            status: match.status,
            ...(match.starRating != null && { starRating: match.starRating }),
            ...(match.matchOfTheNight != null && { matchOfTheNight: match.matchOfTheNight }),
          },
        };
      })
    );

    return success({
      ...eventItem,
      enrichedMatches,
    });
  } catch (err) {
    console.error('Error fetching event:', err);
    return serverError('Failed to fetch event');
  }
};
