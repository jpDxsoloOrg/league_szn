import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { MatchSlot, Player } from '../../lib/repositories/types';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { hydrateMatchSlots } from '../matches/hydrateSlots';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;

    if (!eventId) {
      return badRequest('Event ID is required');
    }

    const { leagueOps: { events }, roster: { players }, competition: { matches, championships, stipulations } } = getRepositories();

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

        // Build a playerId → wrestlerNameSnapshot lookup from this match's
        // slots so the participants list (used by the match-card header) shows
        // the wrestler the player actually claimed with — not their live
        // currentWrestler. Without this, a player who claimed with their
        // alternate would still display as their main in the header even
        // though the slot row below correctly shows the alternate.
        const slots = match.slots as MatchSlot[] | undefined;
        const slotSnapshotByPlayer = new Map<string, string>();
        if (slots) {
          for (const s of slots) {
            if (s.playerId && s.wrestlerNameSnapshot && !slotSnapshotByPlayer.has(s.playerId)) {
              slotSnapshotByPlayer.set(s.playerId, s.wrestlerNameSnapshot);
            }
          }
        }

        // Fetch participant player data via repository. The same lookup also
        // feeds slot hydration below, since slot playerIds are a subset of
        // participants in slot-mode matches.
        const participantData: { playerId: string; playerName: string; wrestlerName: string; psnId?: string }[] = [];
        const playerLookup = new Map<string, Player>();
        if (Array.isArray(match.participants) && match.participants.length > 0) {
          const playerPromises = (match.participants as string[]).map(async (playerId: string) => {
            const player = await players.findById(playerId);
            if (player) playerLookup.set(playerId, player);
            const snapshot = slotSnapshotByPlayer.get(playerId);
            return {
              playerId,
              playerName: player?.name || 'Unknown Player',
              wrestlerName: snapshot ?? player?.currentWrestler ?? 'Unknown Wrestler',
              psnId: player?.psnId,
            };
          });
          participantData.push(...(await Promise.all(playerPromises)));
        }

        // Slot hydration (pure read enrichment, no persistence).
        const hydratedSlots = slots && slots.length > 0
          ? hydrateMatchSlots(slots, playerLookup)
          : undefined;

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
            ...(hydratedSlots && { slots: hydratedSlots, slotsRequired: match.slotsRequired }),
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
