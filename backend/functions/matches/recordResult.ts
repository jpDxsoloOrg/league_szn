import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Match, Championship } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { invokeAsync } from '../../lib/asyncLambda';
import { parseBody } from '../../lib/parseBody';
import { calculateFantasyPoints } from '../fantasy/calculateFantasyPoints';
import { updateGroupStats } from './updateGroupStats';

interface RecordResultBody {
  winners: string[];
  losers: string[];
  isDraw?: boolean;
  starRating?: number;
  matchOfTheNight?: boolean;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const matchId = event.pathParameters?.matchId;

    if (!matchId) {
      return badRequest('Match ID is required');
    }

    const { data: body, error: parseError } = parseBody<RecordResultBody>(event);
    if (parseError) return parseError;

    if (body.isDraw) {
      if (!body.winners || body.winners.length === 0) {
        return badRequest('Draw participants are required (send as winners)');
      }
      body.losers = [];
    } else {
      if (!body.winners || !body.losers || body.winners.length === 0) {
        return badRequest('Winners and losers are required');
      }

      const overlap = body.winners.filter((w: string) => body.losers.includes(w));
      if (overlap.length > 0) {
        return badRequest('A player cannot be both a winner and loser in the same match');
      }
    }

    if (body.starRating != null) {
      const r = body.starRating;
      if (typeof r !== 'number' || r < 0.5 || r > 5 || (r * 2) % 1 !== 0) {
        return badRequest('starRating must be a number between 0.5 and 5 in half-star steps');
      }
    }

    const { competition: { matches }, runInTransaction } = getRepositories();

    // Get the match
    const match = await matches.findByIdWithDate(matchId);
    if (!match) {
      return notFound('Match not found');
    }

    if (match.status === 'completed') {
      return badRequest('Match has already been completed');
    }

    const isDraw = body.isDraw === true;
    const allParticipants = isDraw ? [...body.winners] : [...body.winners, ...body.losers];

    // ── Core transaction: match + player standings + season standings ──
    const matchPatch: Record<string, unknown> = {
      winners: body.winners,
      losers: body.losers,
      status: 'completed',
    };
    if (isDraw) matchPatch.isDraw = true;
    if (body.starRating != null) matchPatch.starRating = body.starRating;
    if (body.matchOfTheNight != null) matchPatch.matchOfTheNight = body.matchOfTheNight;

    try {
      await runInTransaction(async (tx) => {
        // 1. Update match with results
        tx.updateMatch(matchId, match.date, matchPatch);

        // 2. Update player standings (all-time)
        for (const playerId of body.winners) {
          tx.incrementPlayerRecord(playerId, isDraw ? { draws: 1 } : { wins: 1 });
        }
        if (!isDraw) {
          for (const playerId of body.losers) {
            tx.incrementPlayerRecord(playerId, { losses: 1 });
          }
        }

        // 3. Update season standings if match belongs to a season
        if (match.seasonId) {
          for (const playerId of body.winners) {
            tx.incrementStanding(match.seasonId, playerId, isDraw ? { draws: 1 } : { wins: 1 });
          }
          if (!isDraw) {
            for (const playerId of body.losers) {
              tx.incrementStanding(match.seasonId, playerId, { losses: 1 });
            }
          }
        }
      });
    } catch (transactError: unknown) {
      const error = transactError as { name?: string };
      if (error.name === 'TransactionCanceledException') {
        return badRequest('Match result could not be recorded due to a concurrent update. Please try again.');
      }
      throw transactError;
    }

    // ── Championship handling (separate from core transaction) ─────────
    if (match.isChampionship && match.championshipId) {
      await handleChampionshipResult(match, body.winners, isDraw);
    }

    // ── Tournament progression ─────────────────────────────────────────
    if (match.tournamentId) {
      await handleTournamentProgression(match, body.winners, body.losers, isDraw, allParticipants);
    }

    // ── Auto-complete event ────────────────────────────────────────────
    try {
      await autoCompleteEvent(matchId);
    } catch (err) {
      console.warn('Event auto-complete failed:', err);
    }

    // ── Side effects ───────────────────────────────────────────────────
    try {
      await updateGroupStats({
        winners: body.winners,
        losers: body.losers,
        isDraw,
        participants: allParticipants,
        teams: match.teams,
      });
    } catch (err) {
      console.warn('Group stats update failed:', err);
    }

    try {
      await invokeAsync('contenders', { source: 'recordResult' });
    } catch (err) {
      console.warn('Failed to invoke calculateRankings async:', err);
    }
    try {
      await invokeAsync('fantasy', { source: 'recordResult' });
    } catch (err) {
      console.warn('Failed to invoke recalculateWrestlerCosts async:', err);
    }

    const returnedMatch = {
      ...match,
      winners: body.winners,
      losers: body.losers,
      status: 'completed' as const,
      ...(isDraw && { isDraw: true }),
      ...(body.starRating != null && { starRating: body.starRating }),
      ...(body.matchOfTheNight != null && { matchOfTheNight: body.matchOfTheNight }),
    };
    return success({
      message: 'Match result recorded successfully',
      match: returnedMatch,
    });
  } catch (err) {
    console.error('Error recording match result:', err);
    return serverError('Failed to record match result');
  }
};

// ── Championship handling ──────────────────────────────────────────────

async function handleChampionshipResult(
  match: Match & { date: string },
  winners: string[],
  isDraw: boolean,
): Promise<void> {
  if (isDraw) return; // Draws don't affect championships

  const { competition: { championships, contenders, matches: matchesRepo }, runInTransaction } = getRepositories();
  const championshipId = match.championshipId!;

  const championship = await championships.findById(championshipId);
  if (!championship) return;

  const newChampion = winners.length === 1 ? winners[0] : winners;
  const oldChampion = championship.currentChampion;

  const isTitleDefense = oldChampion != null && (
    (typeof oldChampion === 'string' && typeof newChampion === 'string' && oldChampion === newChampion) ||
    (Array.isArray(oldChampion) && Array.isArray(newChampion) &&
      oldChampion.length === newChampion.length &&
      JSON.stringify([...oldChampion].sort()) === JSON.stringify([...newChampion].sort()))
  );

  // Store isTitleDefense flag on match for downstream consumers (fantasy scoring)
  // This is a standalone update, not part of any transaction
  const matchForUpdate = await matchesRepo.findByIdWithDate(match.matchId);
  if (matchForUpdate) {
    // Use a simple UoW for this single update
    await runInTransaction(async (tx) => {
      tx.updateMatch(match.matchId, match.date, { isTitleDefense });
    });
  }

  if (isTitleDefense) {
    // Title defense: increment defenses on the current reign
    const currentReign = await championships.findCurrentReign(championshipId);
    if (currentReign) {
      await championships.incrementDefenses(championshipId, currentReign.wonDate);
    }
  } else {
    // Title change: new champion crowned
    await handleTitleChange(championship, newChampion, match.matchId, oldChampion);

    // Auto-remove contender overrides for new champion(s)
    const championIds: string[] = Array.isArray(newChampion) ? newChampion : [newChampion];
    for (const champId of championIds) {
      try {
        const existingOverride = await contenders.findOverride(championshipId, champId);
        if (existingOverride && existingOverride.active) {
          await contenders.deactivateOverride(championshipId, champId, 'auto-removed: player became champion');
        }
      } catch (err) {
        console.warn(`Failed to auto-remove contender override for player ${champId}:`, err);
      }
    }
  }
}

async function handleTitleChange(
  championship: Championship,
  newChampion: string | string[],
  matchId: string,
  oldChampion: string | string[] | undefined,
): Promise<void> {
  const { competition: { championships }, runInTransaction } = getRepositories();
  const championshipId = championship.championshipId;

  // Find current reign to close it
  const currentReign = oldChampion ? await championships.findCurrentReign(championshipId) : null;

  const wonDate = new Date().toISOString();

  await runInTransaction(async (tx) => {
    // Update championship current champion
    tx.updateChampionship(championshipId, { currentChampion: newChampion });

    // Close old reign if exists
    if (currentReign) {
      const reignStartDate = new Date(currentReign.wonDate);
      const lostDate = new Date();
      const daysHeld = Math.floor((lostDate.getTime() - reignStartDate.getTime()) / (1000 * 60 * 60 * 24));
      tx.closeReign(championshipId, currentReign.wonDate, lostDate.toISOString(), daysHeld);
    }

    // Create new reign
    tx.startReign({
      championshipId,
      wonDate,
      champion: newChampion,
      matchId,
      defenses: 0,
      updatedAt: wonDate,
    });
  });
}

// ── Tournament progression ─────────────────────────────────────────────

async function handleTournamentProgression(
  match: Match,
  winners: string[],
  losers: string[],
  isDraw: boolean,
  allParticipants: string[],
): Promise<void> {
  const { competition: { tournaments } } = getRepositories();
  const tournamentId = match.tournamentId!;

  const tournament = await tournaments.findById(tournamentId);
  if (!tournament) return;

  if (tournament.type === 'round-robin') {
    const standings = (tournament.standings as Record<string, { wins: number; losses: number; draws: number; points: number }>) || {};

    for (const playerId of allParticipants) {
      if (!standings[playerId]) {
        standings[playerId] = { wins: 0, losses: 0, draws: 0, points: 0 };
      }
    }

    if (isDraw) {
      for (const playerId of winners) {
        standings[playerId].draws += 1;
        standings[playerId].points += 1;
      }
    } else {
      for (const playerId of winners) {
        standings[playerId].wins += 1;
        standings[playerId].points += 2;
      }
      for (const playerId of losers) {
        standings[playerId].losses += 1;
      }
    }

    // Check if round-robin is complete
    const participants = (tournament.participants || []) as string[];
    const expectedTotalMatches = (participants.length * (participants.length - 1)) / 2;
    let totalMatchesPlayed = 0;
    for (const playerId of Object.keys(standings)) {
      totalMatchesPlayed += standings[playerId].wins + standings[playerId].draws;
    }
    totalMatchesPlayed = totalMatchesPlayed / 2;

    const isComplete = totalMatchesPlayed >= expectedTotalMatches;

    if (isComplete) {
      let winner = '';
      let maxPoints = -1;
      for (const [playerId, stats] of Object.entries(standings)) {
        if (stats.points > maxPoints) {
          maxPoints = stats.points;
          winner = playerId;
        }
      }
      await tournaments.update(tournamentId, { standings, winner, status: 'completed' } as Partial<typeof tournament>);
    } else {
      const newStatus = tournament.status === 'upcoming' ? 'in-progress' : tournament.status;
      await tournaments.update(tournamentId, { standings, status: newStatus } as Partial<typeof tournament>);
    }
  }

  if (tournament.type === 'single-elimination' && tournament.brackets) {
    const brackets = tournament.brackets as {
      rounds: Array<{
        matches: Array<{
          participant1?: string;
          participant2?: string;
          winner?: string;
          matchId?: string;
        }>;
      }>;
    };
    const winner = winners[0];
    const matchParticipants = match.participants;

    let foundRoundIndex = -1;
    let foundMatchIndex = -1;

    for (let roundIndex = 0; roundIndex < brackets.rounds.length; roundIndex++) {
      const round = brackets.rounds[roundIndex];
      if (!round?.matches) continue;
      for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
        const bracketMatch = round.matches[matchIndex];
        if (!bracketMatch) continue;
        if (
          bracketMatch.participant1 &&
          bracketMatch.participant2 &&
          matchParticipants.includes(bracketMatch.participant1) &&
          matchParticipants.includes(bracketMatch.participant2) &&
          !bracketMatch.winner
        ) {
          foundRoundIndex = roundIndex;
          foundMatchIndex = matchIndex;
          break;
        }
      }
      if (foundRoundIndex !== -1) break;
    }

    if (foundRoundIndex !== -1 && foundMatchIndex !== -1) {
      const foundMatch = brackets.rounds[foundRoundIndex]?.matches?.[foundMatchIndex];
      if (!foundMatch) {
        console.warn(`Corrupted bracket data: round ${foundRoundIndex} match ${foundMatchIndex} is null`);
        return;
      }

      foundMatch.winner = winner;
      foundMatch.matchId = match.matchId;

      const isLastRound = foundRoundIndex === brackets.rounds.length - 1;

      if (isLastRound) {
        await tournaments.update(tournamentId, { brackets, winner, status: 'completed' } as Partial<typeof tournament>);
      } else {
        const nextRoundIndex = foundRoundIndex + 1;
        const nextMatchIndex = Math.floor(foundMatchIndex / 2);
        const isFirstOfPair = foundMatchIndex % 2 === 0;

        const nextMatch = brackets.rounds[nextRoundIndex]?.matches?.[nextMatchIndex];
        if (nextMatch) {
          if (isFirstOfPair) {
            nextMatch.participant1 = winner;
          } else {
            nextMatch.participant2 = winner;
          }
        }

        const newStatus = tournament.status === 'upcoming' ? 'in-progress' : tournament.status;
        await tournaments.update(tournamentId, { brackets, status: newStatus } as Partial<typeof tournament>);
      }
    }
  }
}

// ── Auto-complete event ────────────────────────────────────────────────

async function autoCompleteEvent(matchId: string): Promise<void> {
  const { competition: { matches }, leagueOps: { events } } = getRepositories();

  // Find events that are upcoming or in-progress
  const allEvents = await events.list();
  const activeEvents = allEvents.filter(
    (e) => e.status === 'upcoming' || e.status === 'in-progress',
  );

  for (const eventItem of activeEvents) {
    const matchCards = eventItem.matchCards || [];
    const matchIds = matchCards.map((c) => c.matchId).filter(Boolean);

    if (!matchIds.includes(matchId)) continue;
    if (matchIds.length === 0) continue;

    // Check if ALL matches are completed
    let allCompleted = true;
    for (const mId of matchIds) {
      const m = await matches.findById(mId);
      if (!m || m.status !== 'completed') {
        allCompleted = false;
        break;
      }
    }

    if (allCompleted) {
      await events.update(eventItem.eventId, { status: 'completed' });
      console.log(`Event ${eventItem.eventId} auto-completed: all ${matchIds.length} matches finished`);

      try {
        await calculateFantasyPoints(eventItem.eventId);
      } catch (err) {
        console.warn('Fantasy points calculation failed:', err);
      }
    } else if (eventItem.status === 'upcoming') {
      await events.update(eventItem.eventId, { status: 'in-progress' });
      console.log(`Event ${eventItem.eventId} marked as in-progress`);
    }

    break; // A match should only belong to one event
  }
}
