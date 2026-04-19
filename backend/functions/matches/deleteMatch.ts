import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Match } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { invokeAsync } from '../../lib/asyncLambda';
import { revertGroupStats } from './revertGroupStats';

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
      await rollbackCompletedMatch(match, runInTransaction);

      // Roll back championship changes if this was a championship match
      if (match.isChampionship && match.championshipId) {
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
    try {
      await invokeAsync('fantasy', { source: 'deleteMatch' });
    } catch (err) {
      console.warn('Failed to invoke fantasy recalc:', err);
    }

    return success({ message: 'Match deleted', matchId });
  } catch (err) {
    console.error('Error deleting match:', err);
    return serverError('Failed to delete match');
  }
};

async function rollbackCompletedMatch(
  match: Match,
  runInTransaction: ReturnType<typeof getRepositories>['runInTransaction'],
): Promise<void> {
  const winners = match.winners || [];
  const losers = match.losers || [];
  const isDraw = match.isDraw === true;
  const seasonId = match.seasonId;

  // Use UoW to atomically decrement all player/season stats
  await runInTransaction(async (tx) => {
    // 1. Decrement winner stats (all-time)
    for (const playerId of winners) {
      tx.incrementPlayerRecord(playerId, isDraw ? { draws: -1 } : { wins: -1 });
    }

    // 2. Decrement loser stats (all-time) — skip for draws
    if (!isDraw) {
      for (const playerId of losers) {
        tx.incrementPlayerRecord(playerId, { losses: -1 });
      }
    }

    // 3. Decrement season standings if match had a seasonId
    if (seasonId) {
      for (const playerId of winners) {
        tx.incrementStanding(seasonId, playerId, isDraw ? { draws: -1 } : { wins: -1 });
      }

      if (!isDraw) {
        for (const playerId of losers) {
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
      await revertEventStatus(match.eventId);
    } catch (err) {
      console.warn('Event status revert failed:', err);
    }
  }
}

async function revertEventStatus(eventId: string): Promise<void> {
  const { competition: { matches }, leagueOps: { events } } = getRepositories();

  const eventItem = await events.findById(eventId);
  if (!eventItem) return;

  // Only revert if the event was auto-completed
  if (eventItem.status !== 'completed') return;

  // Check remaining matches to determine correct status
  const matchCards = eventItem.matchCards || [];
  const matchIds = matchCards.map((c) => c.matchId).filter(Boolean);

  if (matchIds.length === 0) return;

  let hasCompleted = false;
  for (const mId of matchIds) {
    const m = await matches.findById(mId);
    if (m && m.status === 'completed') {
      hasCompleted = true;
    }
  }

  // If some matches are still completed, set to in-progress; otherwise upcoming
  const newStatus = hasCompleted ? 'in-progress' : 'upcoming';
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
  } else {
    // This match was a title defense — decrement defense count on current reign
    const currentReign = await championships.findCurrentReign(championshipId);
    if (currentReign && typeof currentReign.defenses === 'number' && currentReign.defenses > 0) {
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
    const patch: Partial<typeof tournament> = { standings, status: newStatus };
    delete (patch as Record<string, unknown>).winner;
    await tournaments.update(tournamentId, patch);
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

    let foundRoundIndex = -1;
    let foundMatchIndex = -1;

    for (let roundIndex = 0; roundIndex < brackets.rounds.length; roundIndex++) {
      const round = brackets.rounds[roundIndex];
      if (!round?.matches) continue;
      for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
        const bracketMatch = round.matches[matchIndex];
        if (bracketMatch?.matchId === match.matchId) {
          foundRoundIndex = roundIndex;
          foundMatchIndex = matchIndex;
          break;
        }
      }
      if (foundRoundIndex !== -1) break;
    }

    if (foundRoundIndex !== -1 && foundMatchIndex !== -1) {
      const foundMatch = brackets.rounds[foundRoundIndex].matches[foundMatchIndex];
      delete foundMatch.winner;
      delete foundMatch.matchId;

      // Clear the advancement in the next round
      const isLastRound = foundRoundIndex === brackets.rounds.length - 1;
      if (!isLastRound) {
        const nextRoundIndex = foundRoundIndex + 1;
        const nextMatchIndex = Math.floor(foundMatchIndex / 2);
        const isFirstOfPair = foundMatchIndex % 2 === 0;

        const nextMatch = brackets.rounds[nextRoundIndex]?.matches?.[nextMatchIndex];
        if (nextMatch) {
          if (isFirstOfPair) {
            delete nextMatch.participant1;
          } else {
            delete nextMatch.participant2;
          }
        }
      }

      const newStatus = tournament.status === 'completed' ? 'in-progress' : tournament.status;
      const patch: Partial<typeof tournament> = { brackets, status: newStatus };
      delete (patch as Record<string, unknown>).winner;
      await tournaments.update(tournamentId, patch);
    }
  }
}
