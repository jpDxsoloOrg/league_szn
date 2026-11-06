import { APIGatewayProxyHandler } from 'aws-lambda';
import { isWithinLifetime } from '../../lib/stats/lifetime';
import { getRepositories } from '../../lib/repositories';
import type { Match } from '../../lib/repositories';
import { success, badRequest, conflict, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { invokeAsync } from '../../lib/asyncLambda';
import { revertGroupStats } from './revertGroupStats';

interface BracketMatch {
  participant1?: string;
  participant2?: string;
  winner?: string;
  matchId?: string;
}

interface Brackets {
  rounds: Array<{ matches: BracketMatch[] }>;
}

interface BracketPosition {
  roundIndex: number;
  matchIndex: number;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Moderator');
  if (denied) return denied;

  try {
    const matchId = event.pathParameters?.matchId;
    if (!matchId) {
      return badRequest('matchId is required');
    }

    const { competition: { matches }, leagueOps: { events }, runInTransaction } = getRepositories();

    // Find the match (need date for composite key delete)
    const match = await matches.findByIdWithDate(matchId);
    if (!match) {
      return notFound('Match not found');
    }

    // If match was completed, roll back all stat changes
    if (match.status === 'completed') {
      // These checks only read. They must stay ahead of every rollback write,
      // because a refusal has to leave records and history untouched.
      const blockedReason =
        await findChampionshipRollbackBlocker(match) ?? await findTournamentRollbackBlocker(match);
      if (blockedReason) {
        return conflict(blockedReason);
      }

      await rollbackCompletedMatch(match, runInTransaction);

      // Roll back championship changes if this was a championship match.
      // Draws never touch a championship, so there is nothing to undo.
      if (match.isChampionship && match.championshipId && match.isDraw !== true) {
        await rollbackChampionshipResult(match);
      }

      // Roll back tournament progression if this was a tournament match
      if (match.tournamentId) {
        await rollbackTournamentResult(match);
      }
    }

    // Delete the match record
    await matches.delete(matchId, match.date);

    // If match was linked to an event, remove it from the event's matchCards
    if (match.eventId) {
      try {
        const eventItem = await events.findById(match.eventId);
        if (eventItem) {
          const updatedCards = (eventItem.matchCards || []).filter(
            (card) => card.matchId !== matchId
          );
          await events.update(match.eventId, { matchCards: updatedCards });
        }
      } catch (err) {
        console.warn('Failed to remove match from event:', err);
      }
    }

    // Trigger async recalculations
    try {
      await invokeAsync('contenders', { source: 'deleteMatch' });
    } catch (err) {
      console.warn('Failed to invoke contenders recalc:', err);
    }

    return success({ message: 'Match deleted', matchId });
  } catch (err) {
    console.error('Error deleting match:', err);
    return serverError('Failed to delete match');
  }
};

/** Why this match's title change cannot be undone, or null if it can. */
async function findChampionshipRollbackBlocker(match: Match): Promise<string | null> {
  if (!match.isChampionship || !match.championshipId || match.isDraw === true) return null;

  const { competition: { championships } } = getRepositories();
  const history = await championships.listHistory(match.championshipId);
  const reignCreatedByMatch = history.find((item) => item.matchId === match.matchId);
  if (!reignCreatedByMatch) return null;

  const reignStart = new Date(reignCreatedByMatch.wonDate).getTime();
  const isLatestReign = history.every((item) => new Date(item.wonDate).getTime() <= reignStart);
  if (!reignCreatedByMatch.lostDate && isLatestReign) return null;

  return 'This match started a title reign that has since ended. Only the current reign can be rolled back.';
}

/** Why this match's bracket result cannot be undone, or null if it can. */
async function findTournamentRollbackBlocker(match: Match): Promise<string | null> {
  if (!match.tournamentId) return null;

  const { competition: { tournaments } } = getRepositories();
  const tournament = await tournaments.findById(match.tournamentId);
  if (tournament?.type !== 'single-elimination' || !tournament.brackets) return null;

  const brackets = tournament.brackets as Brackets;
  const position = locateBracketMatch(brackets, match.matchId);
  if (!position) return null;

  const nextMatch = nextBracketMatch(brackets, position);
  if (nextMatch?.winner || nextMatch?.matchId) {
    return 'The next round of this bracket has already been played. Delete that result first.';
  }
  return null;
}

function locateBracketMatch(brackets: Brackets, matchId: string): BracketPosition | null {
  for (let roundIndex = 0; roundIndex < brackets.rounds.length; roundIndex++) {
    const roundMatches = brackets.rounds[roundIndex]?.matches ?? [];
    const matchIndex = roundMatches.findIndex((bracketMatch) => bracketMatch?.matchId === matchId);
    if (matchIndex !== -1) return { roundIndex, matchIndex };
  }
  return null;
}

/** The match a bracket winner advanced into; undefined for the final. */
function nextBracketMatch(brackets: Brackets, position: BracketPosition): BracketMatch | undefined {
  return brackets.rounds[position.roundIndex + 1]?.matches?.[Math.floor(position.matchIndex / 2)];
}

async function rollbackCompletedMatch(
  match: Match,
  runInTransaction: ReturnType<typeof getRepositories>['runInTransaction'],
): Promise<void> {
  const winners = match.winners || [];
  const losers = match.losers || [];
  const isDraw = match.isDraw === true;
  const { roster: { players }, season: { seasons } } = getRepositories();

  // A completed match outlives its players and season. Deleted players have
  // no record to correct and their standings rows are gone with them, and
  // incrementPlayerRecord fails the transaction on a missing player, so the
  // match would otherwise be undeletable. The same goes for a deleted season:
  // writing to it would only recreate standings rows for a season that is gone.
  const existingPlayerIds = new Set(
    (await Promise.all(
      [...winners, ...losers].map(async (playerId) => ((await players.findById(playerId)) ? playerId : null)),
    )).filter((playerId): playerId is string => playerId !== null),
  );
  const existingWinners = winners.filter((playerId) => existingPlayerIds.has(playerId));
  const existingLosers = losers.filter((playerId) => existingPlayerIds.has(playerId));
  const seasonId = match.seasonId && (await seasons.findById(match.seasonId)) ? match.seasonId : undefined;

  // Use UoW to atomically decrement all player/season stats
  await runInTransaction(async (tx) => {
    // 1. Decrement winner stats (all-time)
    for (const playerId of existingWinners) {
      tx.incrementPlayerRecord(playerId, isDraw ? { draws: -1 } : { wins: -1 });
    }

    // 2. Decrement loser stats (all-time) — skip for draws
    if (!isDraw) {
      for (const playerId of existingLosers) {
        tx.incrementPlayerRecord(playerId, { losses: -1 });
      }
    }

    // 3. Decrement season standings if match had a seasonId
    if (seasonId) {
      for (const playerId of existingWinners) {
        tx.incrementStanding(seasonId, playerId, isDraw ? { draws: -1 } : { wins: -1 });
      }

      if (!isDraw) {
        for (const playerId of existingLosers) {
          tx.incrementStanding(seasonId, playerId, { losses: -1 });
        }
      }
    }
  });

  // 4. Revert stable and tag team group stats (non-critical)
  const allParticipants = isDraw ? [...winners] : [...winners, ...losers];
  try {
    await revertGroupStats({
      winners,
      losers,
      isDraw,
      participants: allParticipants,
      teams: match.teams,
    });
  } catch (err) {
    console.warn('Group stats revert failed:', err);
  }

  // 5. Revert event auto-complete status if needed
  if (match.eventId) {
    try {
      await revertEventStatus(match.eventId, match.matchId);
    } catch (err) {
      console.warn('Event status revert failed:', err);
    }
  }
}

async function revertEventStatus(eventId: string, deletedMatchId: string): Promise<void> {
  const { leagueOps: { events }, competition: { matches } } = getRepositories();

  const eventItem = await events.findById(eventId);
  if (!eventItem) return;

  // Only revert if the event was auto-completed
  if (eventItem.status !== 'completed') return;

  // Check the matches that will remain. This runs before the deleted match and
  // its card are removed, so it is left out here, and a card whose match is
  // already gone says nothing about the event's progress.
  const matchCards = eventItem.matchCards || [];
  const remainingIds = matchCards
    .map((c) => c.matchId)
    .filter((mId) => mId && mId !== deletedMatchId);
  const remaining = (await Promise.all(remainingIds.map((mId) => matches.findById(mId))))
    .filter((m) => m !== null && m !== undefined);

  const completedCount = remaining.filter((m) => m.status === 'completed').length;

  // Every remaining match is finished, so the event stays completed. No further
  // result would arrive to complete it again.
  if (remaining.length > 0 && completedCount === remaining.length) return;

  // If some matches are still completed, set to in-progress; otherwise upcoming
  const newStatus = completedCount > 0 ? 'in-progress' : 'upcoming';
  await events.update(eventId, { status: newStatus as 'upcoming' | 'in-progress' });
}

async function rollbackChampionshipResult(match: Match): Promise<void> {
  const championshipId = match.championshipId!;
  const matchId = match.matchId;
  const { competition: { championships } } = getRepositories();

  // Find the championship history entry created by this match
  const history = await championships.listHistory(championshipId);
  const reignCreatedByMatch = history.find((item) => item.matchId === matchId);

  if (reignCreatedByMatch) {
    // This match created a new reign — delete it and reopen the previous reign
    await championships.deleteHistoryEntry(championshipId, reignCreatedByMatch.wonDate);

    // Find the previous reign (most recent one that has a lostDate)
    const remainingHistory = await championships.listHistory(championshipId);
    const sortedReigns = remainingHistory.sort(
      (a, b) => new Date(b.wonDate).getTime() - new Date(a.wonDate).getTime(),
    );
    const previousReign = sortedReigns.find((r) => r.lostDate);

    if (previousReign) {
      // Reopen the previous reign
      await championships.reopenReign(championshipId, previousReign.wonDate);
      // Restore previous champion on the championship record
      await championships.update(championshipId, {
        currentChampion: previousReign.champion,
      });
    } else {
      // No previous reign — title becomes vacant
      await championships.removeChampion(championshipId);
    }
  } else if (match.isTitleDefense === true) {
    // A defense counts against the reign it was fought in. A defense from
    // before the current reign began belongs to an earlier holder. wonDate is
    // when a result was recorded and an event match carries its date alone, so
    // this compares days: a time comparison would miss a defense later on the
    // card that crowned the champion.
    const currentReign = await championships.findCurrentReign(championshipId);
    if (
      currentReign &&
      isWithinLifetime(match.date, { createdAt: currentReign.wonDate }) &&
      typeof currentReign.defenses === 'number' &&
      currentReign.defenses > 0
    ) {
      await championships.decrementDefenses(championshipId, currentReign.wonDate);
    }
  }
}

async function rollbackTournamentResult(match: Match): Promise<void> {
  const tournamentId = match.tournamentId!;
  const winners = match.winners || [];
  const losers = match.losers || [];
  const isDraw = match.isDraw === true;
  const { competition: { tournaments } } = getRepositories();

  const tournament = await tournaments.findById(tournamentId);
  if (!tournament) return;

  if (tournament.type === 'round-robin') {
    const standings = (tournament.standings as Record<string, { wins: number; losses: number; draws: number; points: number }>) || {};

    if (isDraw) {
      for (const playerId of winners) {
        if (standings[playerId]) {
          standings[playerId].draws = Math.max(0, standings[playerId].draws - 1);
          standings[playerId].points = Math.max(0, standings[playerId].points - 1);
        }
      }
    } else {
      for (const playerId of winners) {
        if (standings[playerId]) {
          standings[playerId].wins = Math.max(0, standings[playerId].wins - 1);
          standings[playerId].points = Math.max(0, standings[playerId].points - 2);
        }
      }
      for (const playerId of losers) {
        if (standings[playerId]) {
          standings[playerId].losses = Math.max(0, standings[playerId].losses - 1);
        }
      }
    }

    const newStatus = tournament.status === 'completed' ? 'in-progress' : tournament.status;
    await tournaments.update(tournamentId, { standings, status: newStatus });
    if (tournament.winner) {
      await tournaments.removeWinner(tournamentId);
    }
  }

  if (tournament.type === 'single-elimination' && tournament.brackets) {
    const brackets = tournament.brackets as Brackets;
    const position = locateBracketMatch(brackets, match.matchId);

    if (position) {
      const foundMatch = brackets.rounds[position.roundIndex].matches[position.matchIndex];
      delete foundMatch.winner;
      delete foundMatch.matchId;

      // Clear the advancement in the next round
      const nextMatch = nextBracketMatch(brackets, position);
      if (nextMatch) {
        if (position.matchIndex % 2 === 0) {
          delete nextMatch.participant1;
        } else {
          delete nextMatch.participant2;
        }
      }

      const newStatus = tournament.status === 'completed' ? 'in-progress' : tournament.status;
      await tournaments.update(tournamentId, { brackets, status: newStatus });
      if (tournament.winner) {
        await tournaments.removeWinner(tournamentId);
      }
    }
  }
}
