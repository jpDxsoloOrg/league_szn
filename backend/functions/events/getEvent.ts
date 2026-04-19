import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;

    if (!eventId) {
      return badRequest('Event ID is required');
    }

    const { leagueOps: { events }, roster: { players }, competition: { stipulations, matches, championships } } = getRepositories();

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

        const match = await matches.findById(card.matchId);

        if (!match) {
          return {
            position: card.position,
            matchId: card.matchId,
            designation: card.designation,
            notes: card.notes,
            matchData: null,
          };
        }

        // Fetch participant player data via repository
        const participantData: { playerId: string; playerName: string; wrestlerName: string }[] = [];
        if (Array.isArray(match.participants) && match.participants.length > 0) {
          const playerPromises = (match.participants as string[]).map(async (playerId: string) => {
            const player = await players.findById(playerId);
            return {
              playerId,
              playerName: player?.name || 'Unknown Player',
              wrestlerName: player?.currentWrestler || 'Unknown Wrestler',
            };
          });
          participantData.push(...(await Promise.all(playerPromises)));
        }

        // Fetch championship name via repository
        let championshipName: string | undefined;
        if (match.isChampionship && match.championshipId) {
          const championship = await championships.findById(match.championshipId as string);
          championshipName = championship?.name;
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
            participants: participantData,
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
