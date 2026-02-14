import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;

    if (!eventId) {
      return badRequest('Event ID is required');
    }

    // Get the event
    const eventResult = await dynamoDb.get({
      TableName: TableNames.EVENTS,
      Key: { eventId },
    });

    if (!eventResult.Item) {
      return notFound('Event not found');
    }

    const eventItem = eventResult.Item as Record<string, any>;
    const matchCards: Record<string, any>[] = eventItem.matchCards || [];

    // Build enrichedMatches array matching the EventWithMatches frontend type
    const enrichedMatches = await Promise.all(
      matchCards.map(async (card: Record<string, any>) => {
        if (!card.matchId) {
          return {
            position: card.position,
            matchId: card.matchId,
            designation: card.designation,
            notes: card.notes,
            matchData: null,
          };
        }

        // Fetch the match (Matches table uses composite key: matchId + date)
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

        const match = matchQuery.Items[0] as Record<string, any>;

        // Fetch participant player data
        const participants: { playerId: string; playerName: string; wrestlerName: string }[] = [];
        if (match.participants && match.participants.length > 0) {
          const playerPromises = match.participants.map(async (playerId: string) => {
            const playerResult = await dynamoDb.get({
              TableName: TableNames.PLAYERS,
              Key: { playerId },
            });
            const player = playerResult.Item as Record<string, any> | undefined;
            return {
              playerId,
              playerName: player?.name || 'Unknown Player',
              wrestlerName: player?.currentWrestler || 'Unknown Wrestler',
            };
          });
          participants.push(...(await Promise.all(playerPromises)));
        }

        // Fetch championship name if applicable
        let championshipName: string | undefined;
        if (match.isChampionship && match.championshipId) {
          const championshipResult = await dynamoDb.get({
            TableName: TableNames.CHAMPIONSHIPS,
            Key: { championshipId: match.championshipId },
          });
          const championship = championshipResult.Item as Record<string, any> | undefined;
          championshipName = championship?.name;
        }

        return {
          position: card.position,
          matchId: card.matchId,
          designation: card.designation,
          notes: card.notes,
          matchData: {
            matchId: match.matchId,
            matchFormat: match.matchFormat,
            stipulation: match.stipulation,
            participants,
            winners: match.winners,
            losers: match.losers,
            isChampionship: match.isChampionship || false,
            championshipName,
            status: match.status,
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
