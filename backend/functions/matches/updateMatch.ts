import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { MatchCardEntry, MatchDesignation } from '../../lib/repositories/types';
import type { EventPatch } from '../../lib/repositories/LeagueOpsRepository';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface UpdateMatchBody {
  matchFormat?: string;
  stipulationId?: string | null;
  participants?: string[];
  teams?: string[][] | null;
  isChampionship?: boolean;
  championshipId?: string | null;
  tournamentId?: string | null;
  seasonId?: string | null;
  eventId?: string | null;
  designation?: string | null;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const repos = getRepositories();
    const matchId = event.pathParameters?.matchId;
    if (!matchId) {
      return badRequest('matchId is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateMatchBody>(event);
    if (parseError) return parseError;

    // Fetch existing match (matchId is PK, need to find the sort key 'date')
    const existingMatch = await repos.competition.matches.findByIdWithDate(matchId);
    if (!existingMatch) {
      return notFound('Match not found');
    }

    const existingRecord = existingMatch as unknown as Record<string, unknown>;

    // Only allow editing scheduled matches
    if (existingMatch.status !== 'scheduled') {
      return badRequest('Only scheduled matches can be edited');
    }

    // Validate participants if provided
    if (body.participants) {
      if (body.participants.length < 2) {
        return badRequest('At least 2 participants are required');
      }

      // Check for duplicate participants
      const uniqueParticipants = new Set(body.participants);
      if (uniqueParticipants.size !== body.participants.length) {
        return badRequest('Duplicate participants are not allowed');
      }

      const playerValidationPromises = body.participants.map(async (playerId) => {
        const player = await repos.roster.players.findById(playerId);
        return { playerId, exists: !!player, player: player as unknown as Record<string, unknown> | null };
      });

      const playerResults = await Promise.all(playerValidationPromises);
      const missingPlayers = playerResults.filter((p) => !p.exists).map((p) => p.playerId);

      if (missingPlayers.length > 0) {
        return notFound(`Players not found: ${missingPlayers.join(', ')}`);
      }

      // Validate championship division restriction if championship is set
      const effectiveChampionshipId = body.championshipId !== undefined
        ? body.championshipId
        : existingRecord.championshipId as string | undefined;

      if (effectiveChampionshipId) {
        const championship = await repos.competition.championships.findById(effectiveChampionshipId);

        if (championship) {
          const champDivisionId = (championship as unknown as Record<string, unknown>).divisionId as string | undefined;
          if (champDivisionId) {
            const wrongDivision = playerResults.filter((p) => {
              const playerDivision = p.player?.divisionId as string | undefined;
              return playerDivision !== champDivisionId;
            });

            if (wrongDivision.length > 0) {
              return badRequest(
                `Championship is locked to a division. The following participants are not in the correct division: ${wrongDivision.map((p) => p.playerId).join(', ')}`,
              );
            }
          }
        }
      }
    }

    // Validate championship exists if provided
    if (body.championshipId) {
      const championship = await repos.competition.championships.findById(body.championshipId);

      if (!championship) {
        return notFound(`Championship not found: ${body.championshipId}`);
      }
    }

    // Validate isChampionship + championshipId consistency
    const effectiveIsChampionship = body.isChampionship !== undefined
      ? body.isChampionship
      : existingRecord.isChampionship as boolean;
    const effectiveChampionshipId = body.championshipId !== undefined
      ? body.championshipId
      : existingRecord.championshipId as string | null | undefined;

    if (effectiveIsChampionship && !effectiveChampionshipId) {
      return badRequest('Championship ID is required for championship matches');
    }

    // Validate tournament exists if provided
    if (body.tournamentId) {
      const tournament = await repos.competition.tournaments.findById(body.tournamentId);

      if (!tournament) {
        return notFound(`Tournament not found: ${body.tournamentId}`);
      }

      if (tournament.status === 'completed') {
        return badRequest('Cannot assign match to a completed tournament');
      }
    }

    // Validate season exists and is active if provided
    if (body.seasonId) {
      const season = await repos.season.seasons.findById(body.seasonId);

      if (!season) {
        return notFound(`Season not found: ${body.seasonId}`);
      }

      if (season.status !== 'active') {
        return badRequest('Cannot assign match to an inactive season');
      }
    }

    // Validate stipulationId exists if provided
    if (body.stipulationId) {
      const stipulation = await repos.competition.stipulations.findById(body.stipulationId);

      if (!stipulation) {
        return notFound(`Stipulation not found: ${body.stipulationId}`);
      }
    }

    // Build patch for update
    const patch: Record<string, unknown> = {};
    const fieldsToUpdate: Array<{ key: string; bodyKey: keyof UpdateMatchBody }> = [
      { key: 'matchFormat', bodyKey: 'matchFormat' },
      { key: 'stipulationId', bodyKey: 'stipulationId' },
      { key: 'participants', bodyKey: 'participants' },
      { key: 'teams', bodyKey: 'teams' },
      { key: 'isChampionship', bodyKey: 'isChampionship' },
      { key: 'championshipId', bodyKey: 'championshipId' },
      { key: 'tournamentId', bodyKey: 'tournamentId' },
      { key: 'seasonId', bodyKey: 'seasonId' },
      { key: 'eventId', bodyKey: 'eventId' },
      { key: 'designation', bodyKey: 'designation' },
    ];

    for (const field of fieldsToUpdate) {
      if (body[field.bodyKey] !== undefined) {
        patch[field.key] = body[field.bodyKey];
      }
    }

    if (Object.keys(patch).length === 0) {
      return badRequest('No fields to update');
    }

    const matchDate = existingMatch.date;

    await repos.competition.matches.update(matchId, matchDate, patch);

    // Handle eventId changes — remove from old event, add to new event
    // Also handle designation changes when staying on the same event
    const oldEventId = existingRecord.eventId as string | undefined;
    const newEventId = body.eventId !== undefined ? (body.eventId as string | null) : undefined;

    // Designation changed but event stayed the same — update the card in-place
    const effectiveEventId = newEventId !== undefined ? newEventId : oldEventId;
    if (body.designation !== undefined && effectiveEventId && (newEventId === undefined || newEventId === oldEventId)) {
      try {
        const eventRecord = await repos.leagueOps.events.findById(effectiveEventId);

        if (eventRecord) {
          const matchCards = ((eventRecord as unknown as Record<string, unknown>).matchCards as MatchCardEntry[] | undefined) || [];
          const updatedCards = matchCards.map((card) => {
            if (card.matchId === matchId) {
              return { ...card, designation: body.designation as MatchDesignation };
            }
            return card;
          });

          await repos.leagueOps.events.update(effectiveEventId, {
            matchCards: updatedCards,
          } as EventPatch);
        }
      } catch (err) {
        console.warn('Failed to update designation on event:', err);
      }
    }

    if (newEventId !== undefined && newEventId !== oldEventId) {
      // Remove from old event if it had one
      if (oldEventId) {
        try {
          const oldEvent = await repos.leagueOps.events.findById(oldEventId);

          if (oldEvent) {
            const matchCards = ((oldEvent as unknown as Record<string, unknown>).matchCards as MatchCardEntry[] | undefined) || [];
            const updatedCards = matchCards.filter(
              (card) => card.matchId !== matchId,
            );

            await repos.leagueOps.events.update(oldEventId, {
              matchCards: updatedCards,
            } as EventPatch);
          }
        } catch (err) {
          console.warn('Failed to remove match from old event:', err);
        }
      }

      // Add to new event if one was provided
      if (newEventId) {
        try {
          const newEvent = await repos.leagueOps.events.findById(newEventId);

          if (newEvent) {
            const existingCards = ((newEvent as unknown as Record<string, unknown>).matchCards as MatchCardEntry[] | undefined) || [];
            const newCard: MatchCardEntry = {
              matchId,
              position: existingCards.length + 1,
              designation: (body.designation || (existingRecord.designation as string | undefined) || 'midcard') as MatchDesignation,
            };

            await repos.leagueOps.events.update(newEventId, {
              matchCards: [...existingCards, newCard],
            } as EventPatch);
          }
        } catch (err) {
          console.warn('Failed to add match to new event:', err);
        }
      }
    }

    // Return the updated match
    const updatedMatch = await repos.competition.matches.findByIdWithDate(matchId);
    return success(updatedMatch || { matchId, updated: true });
  } catch (err) {
    console.error('Error updating match:', err);
    return serverError('Failed to update match');
  }
};
