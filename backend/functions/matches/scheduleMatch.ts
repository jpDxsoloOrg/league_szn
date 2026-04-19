import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../../lib/repositories';
import type { MatchDesignation, MatchCardEntry } from '../../lib/repositories/types';
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
  const rawRepos = getRepositories();
  const repos = {
    matches: rawRepos.competition.matches,
    championships: rawRepos.competition.championships,
    tournaments: rawRepos.competition.tournaments,
    stipulations: rawRepos.competition.stipulations,
    players: rawRepos.roster.players,
    events: rawRepos.leagueOps.events,
    seasons: rawRepos.season.seasons,
    challenges: rawRepos.user.challenges,
    promos: rawRepos.content.promos,
  };

  if (!input.matchFormat || !input.participants || input.participants.length < 2) {
    throw new ScheduleMatchError(400, 'matchFormat and at least 2 participants are required');
  }

  // Resolve date: use provided date, or event date if eventId given, or today
  let resolvedDate = input.date;
  if (!resolvedDate && input.eventId) {
    const eventForDate = await repos.events.findById(input.eventId);
    if (eventForDate) {
      resolvedDate = (eventForDate as unknown as Record<string, unknown>).date as string;
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
    const player = await repos.players.findById(playerId);
    return { playerId, exists: !!player, player: player as unknown as Record<string, unknown> | null };
  });

  const playerResults = await Promise.all(playerValidationPromises);
  const missingPlayers = playerResults.filter((p) => !p.exists).map((p) => p.playerId);

  if (missingPlayers.length > 0) {
    throw new ScheduleMatchError(404, `Players not found: ${missingPlayers.join(', ')}`);
  }

  // Validate championship exists if provided
  if (input.championshipId) {
    const championship = await repos.championships.findById(input.championshipId);

    if (!championship) {
      throw new ScheduleMatchError(404, `Championship not found: ${input.championshipId}`);
    }

    // Enforce division restriction: all participants must belong to the championship's division
    const champDivisionId = (championship as unknown as Record<string, unknown>).divisionId as string | undefined;
    if (champDivisionId) {
      const wrongDivision = playerResults.filter((p) => {
        const playerDivision = p.player?.divisionId as string | undefined;
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
    const tournament = await repos.tournaments.findById(input.tournamentId);

    if (!tournament) {
      throw new ScheduleMatchError(404, `Tournament not found: ${input.tournamentId}`);
    }

    if (tournament.status === 'completed') {
      throw new ScheduleMatchError(400, 'Cannot schedule match for a completed tournament');
    }
  }

  // Validate season exists and is active if provided
  if (input.seasonId) {
    const season = await repos.seasons.findById(input.seasonId);

    if (!season) {
      throw new ScheduleMatchError(404, `Season not found: ${input.seasonId}`);
    }

    if (season.status !== 'active') {
      throw new ScheduleMatchError(400, 'Cannot schedule match for an inactive season');
    }
  }

  // Validate stipulationId exists if provided
  if (input.stipulationId) {
    const stipulation = await repos.stipulations.findById(input.stipulationId);

    if (!stipulation) {
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

  await repos.matches.create(match);

  // If challengeId provided, mark challenge as scheduled and link match
  if (input.challengeId) {
    const challenge = await repos.challenges.findById(input.challengeId);
    if (challenge && ['pending', 'countered', 'accepted'].includes(challenge.status)) {
      await repos.challenges.update(input.challengeId, {
        status: 'scheduled',
        matchId: match.matchId as string,
        updatedAt: now,
      });
    }
  }

  // If promoId provided, hide promo and optionally link match (scheduling from call-out auto-hides it)
  if (input.promoId) {
    const promo = await repos.promos.findById(input.promoId);
    if (promo) {
      await repos.promos.update(input.promoId, {
        isHidden: true,
        matchId: match.matchId as string,
        updatedAt: now,
      });
    }
  }

  // If an event was specified, auto-add the match to the event's matchCards
  if (input.eventId) {
    const eventRecord = await repos.events.findById(input.eventId);

    if (eventRecord) {
      const existingCards = ((eventRecord as unknown as Record<string, unknown>).matchCards as MatchCardEntry[] | undefined) || [];
      const newCard: MatchCardEntry = {
        matchId: match.matchId as string,
        position: existingCards.length + 1,
        designation: (input.designation || 'midcard') as MatchDesignation,
      };

      await repos.events.update(input.eventId, {
        matchCards: [...existingCards, newCard],
      });
    }
  }

  // Notify all participants who have linked user accounts
  const notificationParams = playerResults
    .filter((p) => {
      return p.player?.userId;
    })
    .map((p) => {
      return {
        userId: p.player!.userId as string,
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
