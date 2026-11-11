import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../../lib/repositories';
import type { Championship, MatchDesignation, MatchCardEntry, MatchSlot, MatchStatus } from '../../lib/repositories/types';
import { created, badRequest, notFound, refused, serverError, error as errorResponse, type RefusalCode } from '../../lib/response';
import { createNotifications } from '../../lib/notifications';
import { parseBody } from '../../lib/parseBody';
import { CHALLENGE_NEEDS_CHAMPION_MESSAGE, championIsOnASide, titleFormatError } from '../../lib/challengeTitle';
import { findPromoChallenge, followCounters } from '../../lib/callOutChallenge';
import { bookingRefusal } from '../../lib/discipline';

/** The frontend matches this wording to show its translation, in ScheduleMatch.tsx. */
export const ALREADY_BOOKED_MESSAGE = 'This call-out or challenge already has a match booked';

const OPEN_CHALLENGE_STATUSES = ['pending', 'countered', 'accepted'];

export interface SlotInput {
  position: number;
  playerId?: string;
  lockedByAdmin?: boolean;
  teamLabel?: string;
}

export interface ScheduleMatchInput {
  date?: string;
  matchFormat: string; // "singles", "tag", "triple-threat", etc.
  stipulationId?: string;
  participants?: string[];
  slots?: SlotInput[];
  slotsRequired?: number;
  teams?: string[][];
  isChampionship: boolean;
  championshipId?: string;
  tournamentId?: string;
  seasonId?: string;
  eventId?: string;
  designation?: string;
  challengeId?: string;
  promoId?: string;
  /** Optional pointer to the rivalry this match advances (RIV-06). */
  rivalryId?: string;
}

export interface ScheduleMatchResult {
  matchId: string;
  date: string;
  matchFormat: string;
  stipulationId?: string;
  participants: string[];
  slots?: MatchSlot[];
  slotsRequired?: number;
  teams?: string[][];
  isChampionship: boolean;
  championshipId?: string;
  tournamentId?: string;
  seasonId?: string;
  eventId?: string;
  challengeId?: string;
  promoId?: string;
  rivalryId?: string;
  status: MatchStatus;
  createdAt: string;
}

/**
 * Error thrown by scheduleMatchInternal when validation fails or a referenced
 * resource cannot be found. Carries an HTTP-style status code so callers
 * (including the Lambda HTTP handler) can translate it back to a response.
 */
export class ScheduleMatchError extends Error {
  public readonly statusCode: number;
  /** Set when the frontend should translate the error by code. */
  public readonly code?: RefusalCode;

  constructor(statusCode: number, message: string, code?: RefusalCode) {
    super(message);
    this.name = 'ScheduleMatchError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Core "schedule a match" logic, decoupled from API Gateway. Call this from
 * any handler that needs to create a match row
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
  const repos = getRepositories();
  const { competition, roster, season: seasonAggregate, leagueOps, user, content, rivalries } = repos;

  if (!input.matchFormat) {
    throw new ScheduleMatchError(400, 'matchFormat is required');
  }

  // Detect slot-mode vs legacy-participants payload
  const isSlotMode = input.slots !== undefined || input.slotsRequired !== undefined;
  const hasLegacyParticipants = Array.isArray(input.participants) && input.participants.length > 0;
  if (isSlotMode && hasLegacyParticipants) {
    throw new ScheduleMatchError(400, 'Cannot mix slot-based payload with participants array');
  }

  const now = new Date().toISOString();

  // resolvedSlots: server-shaped slots with generated slotIds; only set in slot-mode
  // derivedParticipants: union of filled slot playerIds (slot-mode) or input.participants (legacy)
  let resolvedSlots: MatchSlot[] | undefined;
  let derivedParticipants: string[];

  if (isSlotMode) {
    if (typeof input.slotsRequired !== 'number' || input.slotsRequired < 2) {
      throw new ScheduleMatchError(400, 'slotsRequired must be a number >= 2');
    }
    if (!Array.isArray(input.slots) || input.slots.length !== input.slotsRequired) {
      throw new ScheduleMatchError(
        400,
        `slots length must equal slotsRequired (${input.slotsRequired})`,
      );
    }
    // Positions must be 1..N contiguous (no gaps, no duplicates)
    const sortedPositions = input.slots.map((s) => s.position).sort((a, b) => a - b);
    for (let i = 0; i < sortedPositions.length; i += 1) {
      if (sortedPositions[i] !== i + 1) {
        throw new ScheduleMatchError(400, 'Slot positions must be 1..N contiguous');
      }
    }
    const filledIds = input.slots
      .map((s) => s.playerId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (new Set(filledIds).size !== filledIds.length) {
      throw new ScheduleMatchError(400, 'Duplicate playerId across slots is not allowed');
    }
    derivedParticipants = filledIds;
    resolvedSlots = input.slots.map((s) => {
      const slot: MatchSlot = {
        slotId: uuidv4(),
        position: s.position,
      };
      if (s.playerId) {
        slot.playerId = s.playerId;
        slot.claimedAt = now;
      }
      if (s.lockedByAdmin) slot.lockedByAdmin = true;
      if (s.teamLabel) slot.teamLabel = s.teamLabel;
      return slot;
    });
  } else {
    if (!Array.isArray(input.participants) || input.participants.length < 2) {
      throw new ScheduleMatchError(400, 'at least 2 participants are required');
    }
    // Check for duplicate participants
    const uniqueParticipants = new Set(input.participants);
    if (uniqueParticipants.size !== input.participants.length) {
      throw new ScheduleMatchError(400, 'Duplicate participants are not allowed');
    }
    derivedParticipants = input.participants;
  }

  // Resolve date: use provided date, or event date if eventId given, or today
  let resolvedDate = input.date;
  if (!resolvedDate && input.eventId) {
    const eventForDate = await leagueOps.events.findById(input.eventId);
    if (eventForDate) {
      resolvedDate = (eventForDate as unknown as Record<string, unknown>).date as string;
    }
  }
  if (!resolvedDate) {
    resolvedDate = now;
  }

  if (input.isChampionship && !input.championshipId) {
    throw new ScheduleMatchError(400, 'Championship ID is required for championship matches');
  }

  // Validate all (filled) participants exist. In slot-mode this is filled slots only;
  // in legacy mode it's the full participants array.
  const playerValidationPromises = derivedParticipants.map(async (playerId) => {
    const player = await roster.players.findById(playerId);
    return { playerId, exists: !!player, player };
  });

  const playerResults = await Promise.all(playerValidationPromises);
  const missingPlayers = playerResults.filter((p) => !p.exists).map((p) => p.playerId);

  if (missingPlayers.length > 0) {
    throw new ScheduleMatchError(404, `Players not found: ${missingPlayers.join(', ')}`);
  }

  // Validate championship exists if provided
  let championship: Championship | null = null;
  if (input.championshipId) {
    championship = await competition.championships.findById(input.championshipId);

    if (!championship) {
      throw new ScheduleMatchError(404, `Championship not found: ${input.championshipId}`);
    }

    if (input.isChampionship) {
      if (championship.isActive === false) {
        throw new ScheduleMatchError(400, 'This championship is inactive and cannot be defended');
      }
      const formatError = titleFormatError(championship.type, input.matchFormat);
      if (formatError) throw new ScheduleMatchError(400, formatError);
    }

    // Enforce division restriction: all participants must belong to the championship's division
    const champDivisionId = (championship as unknown as Record<string, unknown>).divisionId as string | undefined;
    if (champDivisionId) {
      const wrongDivision = playerResults.filter((p) => {
        return p.player?.divisionId !== champDivisionId;
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
  let tournamentEntrants: ReadonlySet<string> = new Set();
  if (input.tournamentId) {
    const tournament = await competition.tournaments.findById(input.tournamentId);

    if (!tournament) {
      throw new ScheduleMatchError(404, `Tournament not found: ${input.tournamentId}`);
    }

    if (tournament.status === 'completed') {
      throw new ScheduleMatchError(400, 'Cannot schedule match for a completed tournament');
    }

    tournamentEntrants = new Set(tournament.participants);
  }

  // A deactivated player cannot be booked, except by staff inside a tournament
  // they already entered, so that it can finish on a forfeit (owner decision 20).
  // A sign-up block does not stop staff booking.
  for (const { playerId, player } of playerResults) {
    const refusal = player && !tournamentEntrants.has(playerId) ? bookingRefusal(player) : null;
    if (refusal) {
      const { message, code } = JSON.parse(refusal.body) as { message: string; code: RefusalCode };
      throw new ScheduleMatchError(refusal.statusCode, message, code);
    }
  }

  // Validate season exists and is active if provided
  if (input.seasonId) {
    const season = await seasonAggregate.seasons.findById(input.seasonId);

    if (!season) {
      throw new ScheduleMatchError(404, `Season not found: ${input.seasonId}`);
    }

    if (season.status !== 'active') {
      throw new ScheduleMatchError(400, 'Cannot schedule match for an inactive season');
    }
  }

  // Validate stipulationId exists if provided
  if (input.stipulationId) {
    const stipulation = await competition.stipulations.findById(input.stipulationId);

    if (!stipulation) {
      throw new ScheduleMatchError(404, `Stipulation not found: ${input.stipulationId}`);
    }
  }

  // Validate rivalryId exists and includes the match participants if provided
  // (RIV-06). Lookup is done once and the participant check is a single
  // set-membership pass — no repeated work per participant.
  let resolvedRivalryId = input.rivalryId;
  if (input.rivalryId) {
    const rivalry = await rivalries.get(input.rivalryId);
    if (!rivalry) {
      throw new ScheduleMatchError(404, `Rivalry not found: ${input.rivalryId}`);
    }
    const rivalryPlayerIds = new Set(rivalry.participants.map((p) => p.playerId));
    const overlap = derivedParticipants.filter((id) => rivalryPlayerIds.has(id));
    if (overlap.length < 2) {
      throw new ScheduleMatchError(
        400,
        `Rivalry ${input.rivalryId} does not include both match participants`,
      );
    }
  } else if (derivedParticipants.length >= 2) {
    // Auto-link to an active rivalry when one — and only one — rivalry
    // already includes every match participant we have. This is what
    // makes a GM-scheduled match show up in the rivalry's Future Matches
    // tab without the GM needing to know about rivalryId. Ambiguous
    // overlaps (zero or multiple matching rivalries) are left unlinked
    // and rely on the frontend's participant-overlap fallback.
    //
    // Defensive: a rivalry-store outage must not block the user from
    // scheduling a match. On any failure, fall back to no auto-link.
    try {
      const participantsInMatch = new Set(derivedParticipants);
      const candidatePage = await rivalries.listByParticipant(derivedParticipants[0]);
      const candidates = Array.isArray(candidatePage?.items) ? candidatePage.items : [];
      const matchingRivalries = candidates.filter((r) => {
        if (r.status !== 'active') return false;
        if (!Array.isArray(r.participants)) return false;
        return r.participants.every((p) => participantsInMatch.has(p.playerId));
      });
      if (matchingRivalries.length === 1) {
        resolvedRivalryId = matchingRivalries[0].rivalryId;
      }
    } catch (autoLinkErr) {
      console.warn(
        'scheduleMatch: rivalry auto-link failed, scheduling without rivalryId',
        autoLinkErr,
      );
    }
  }

  // A call-out and its challenge are one booking, reached from either side.
  // A booking counts until its match is deleted or cancelled, so that match
  // can still be rebooked.
  const requestedPromo = input.promoId ? await content.promos.findById(input.promoId) : null;
  const namedChallenge = input.challengeId
    ? await user.challenges.findById(input.challengeId)
    : requestedPromo && await findPromoChallenge(requestedPromo, user.challenges);
  const linkedChallenge = namedChallenge ? await followCounters(namedChallenge, user.challenges) : null;
  const linkedPromo = requestedPromo
    ?? (linkedChallenge?.promoId ? await content.promos.findById(linkedChallenge.promoId) : null);

  const hasLiveMatch = async (matchId: string | undefined): Promise<boolean> => {
    if (!matchId) return false;
    const booked = await competition.matches.findById(matchId);
    return Boolean(booked) && booked?.status !== 'cancelled';
  };
  const challengeIsBooked = linkedChallenge?.status === 'scheduled' && await hasLiveMatch(linkedChallenge.matchId);
  const callOutIsBooked = linkedPromo?.promoType === 'call-out' && await hasLiveMatch(linkedPromo.matchId);
  if (challengeIsBooked || callOutIsBooked) {
    throw new ScheduleMatchError(400, ALREADY_BOOKED_MESSAGE);
  }

  // The title can change hands after a challenge is issued, and the result
  // crowns whoever wins. Staff booking a title match directly are not held to
  // this: they can see who is in it, and it isn't tied to an old agreement.
  if (input.isChampionship && linkedChallenge && championship) {
    const sides = input.teams && input.teams.length > 0 ? input.teams : [derivedParticipants];
    if (!championIsOnASide(championship, sides)) {
      throw new ScheduleMatchError(400, CHALLENGE_NEEDS_CHAMPION_MESSAGE);
    }
  }

  // Status: open-signups when slot-mode has any unfilled slot; scheduled otherwise.
  const hasOpenSlot = resolvedSlots
    ? resolvedSlots.some((s) => !s.playerId)
    : false;
  const status: MatchStatus = hasOpenSlot ? 'open-signups' : 'scheduled';

  const match: Record<string, unknown> = {
    matchId: uuidv4(),
    date: resolvedDate,
    matchFormat: input.matchFormat,
    stipulationId: input.stipulationId,
    participants: derivedParticipants,
    isChampionship: input.isChampionship,
    championshipId: input.championshipId,
    tournamentId: input.tournamentId,
    seasonId: input.seasonId,
    status,
    createdAt: now,
  };
  if (resolvedSlots) {
    match.slots = resolvedSlots;
    match.slotsRequired = input.slotsRequired;
  }
  if (input.eventId) match.eventId = input.eventId;
  if (input.teams && input.teams.length > 0) match.teams = input.teams;
  const challengeId = linkedChallenge?.challengeId ?? input.challengeId;
  const promoId = linkedPromo?.promoId ?? input.promoId;
  if (challengeId) match.challengeId = challengeId;
  if (promoId) match.promoId = promoId;
  if (resolvedRivalryId) match.rivalryId = resolvedRivalryId;

  await competition.matches.create(match);

  // Mark the challenge scheduled and link the match. A scheduled challenge that
  // got here lost its match, so it takes the new one.
  if (linkedChallenge && [...OPEN_CHALLENGE_STATUSES, 'scheduled'].includes(linkedChallenge.status)) {
    await user.challenges.update(linkedChallenge.challengeId, {
      status: 'scheduled',
      matchId: match.matchId as string,
      updatedAt: now,
    });
  }

  // Hide the promo and link the match (scheduling from a call-out auto-hides it)
  if (linkedPromo) {
    await content.promos.update(linkedPromo.promoId, {
      isHidden: true,
      matchId: match.matchId as string,
      updatedAt: now,
    });
  }

  // If an event was specified, auto-add the match to the event's matchCards
  if (input.eventId) {
    const eventRecord = await leagueOps.events.findById(input.eventId);

    if (eventRecord) {
      const existingCards = ((eventRecord as unknown as Record<string, unknown>).matchCards as MatchCardEntry[] | undefined) || [];
      const newCard: MatchCardEntry = {
        matchId: match.matchId as string,
        position: existingCards.length + 1,
        designation: (input.designation || 'midcard') as MatchDesignation,
      };

      await leagueOps.events.update(input.eventId, {
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
      if (err.code) return refused(err.statusCode, err.code, err.message);
      if (err.statusCode === 400) return badRequest(err.message);
      if (err.statusCode === 404) return notFound(err.message);
      return errorResponse(err.statusCode, err.message);
    }
    console.error('Error scheduling match:', err);
    return serverError('Failed to schedule match');
  }
};
