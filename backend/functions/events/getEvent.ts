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

    // Enrich match card data
    if (eventItem.matchCards && eventItem.matchCards.length > 0) {
      const enrichedMatchCards = await Promise.all(
        eventItem.matchCards.map(async (card: Record<string, any>) => {
          if (!card.matchId) {
            return card;
          }

          // Fetch the match
          const matchResult = await dynamoDb.get({
            TableName: TableNames.MATCHES,
            Key: { matchId: card.matchId },
          });

          if (!matchResult.Item) {
            return card;
          }

          const match = matchResult.Item as Record<string, any>;

          // Fetch participant player data
          let participants: Record<string, any>[] = [];
          if (match.participants && match.participants.length > 0) {
            const playerPromises = match.participants.map(async (playerId: string) => {
              const playerResult = await dynamoDb.get({
                TableName: TableNames.PLAYERS,
                Key: { playerId },
              });
              return playerResult.Item || { playerId, name: 'Unknown Player' };
            });
            participants = await Promise.all(playerPromises);
          }

          // Fetch championship data if applicable
          let championship: Record<string, any> | null = null;
          if (match.isChampionship && match.championshipId) {
            const championshipResult = await dynamoDb.get({
              TableName: TableNames.CHAMPIONSHIPS,
              Key: { championshipId: match.championshipId },
            });
            championship = (championshipResult.Item as Record<string, any>) || null;
          }

          return {
            ...card,
            match: {
              ...match,
              participantDetails: participants,
              championship,
            },
          };
        })
      );

      eventItem.matchCards = enrichedMatchCards;
    }

    return success(eventItem);
  } catch (err) {
    console.error('Error fetching event:', err);
    return serverError('Failed to fetch event');
  }
};
