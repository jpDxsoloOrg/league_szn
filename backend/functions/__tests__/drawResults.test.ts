import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
vi.mock('../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('./visibilityTestHelpers');
  return { authenticate: fakeAuthenticate };
});

import { buildInMemoryRepositories } from '../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../lib/repositories';
import { handler as getStatistics } from '../statistics/getStatistics';
import { handler as getPlayerStatistics } from '../players/getPlayerStatistics';
import { handler as getMatchHistoryRivalries } from '../rivalries/getMatchHistoryRivalries';
import { handler as getCommentary } from '../events/getCommentary';
import { computeAutoAwards } from '../seasonAwards/getSeasonAwards';
import { call, makeEvent } from './visibilityTestHelpers';

interface Stats {
  statType: string;
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number;
  longestWinStreak: number;
}

let repos: Repositories;
let crow: string;
let kai: string;

async function addMatch(
  matchId: string,
  date: string,
  participants: string[],
  winners: string[],
  losers: string[],
  isDraw = false,
): Promise<void> {
  await repos.competition.matches.create({
    matchId,
    date,
    matchFormat: 'singles',
    participants,
    winners,
    losers,
    isDraw,
    status: 'completed',
    seasonId: 's1',
    createdAt: date,
    updatedAt: date,
  });
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  crow = (await repos.roster.players.create({ name: 'Crow', currentWrestler: 'Sting' })).playerId;
  kai = (await repos.roster.players.create({ name: 'Kai', currentWrestler: 'Ricochet' })).playerId;

  // Win, draw, win: a draw stores both players in winners, as recordResult does.
  await addMatch('m1', '2026-01-01', [crow, kai], [crow], [kai]);
  await addMatch('m2', '2026-01-02', [crow, kai], [crow, kai], [], true);
  await addMatch('m3', '2026-01-03', [crow, kai], [crow], [kai]);
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('a stored draw', () => {
  it('counts as a draw and breaks a streak on the Stats page', async () => {
    const { body } = await call<{ statistics: Stats[] }>(
      getStatistics,
      makeEvent({ queryStringParameters: { section: 'player-stats', playerId: crow } }),
    );

    const overall = body.statistics.find((s) => s.statType === 'overall');
    expect(overall).toMatchObject({ wins: 2, losses: 0, draws: 1, winPercentage: 66.7, longestWinStreak: 1 });
  });

  it('is not a win for the player who only ever drew', async () => {
    const { body } = await call<{ statistics: Stats[] }>(
      getStatistics,
      makeEvent({ queryStringParameters: { section: 'player-stats', playerId: kai } }),
    );

    expect(body.statistics.find((s) => s.statType === 'overall')).toMatchObject({ wins: 0, losses: 2, draws: 1 });
  });

  it('does not add to Most Wins on the leaderboards', async () => {
    const { body } = await call<{ leaderboards: { mostWins: Array<{ playerId: string; value: number }> } }>(
      getStatistics,
      makeEvent({ queryStringParameters: { section: 'leaderboards' } }),
    );

    expect(body.leaderboards.mostWins.map((row) => [row.playerId, row.value])).toEqual([[crow, 2], [kai, 0]]);
  });

  it('gives the same head-to-head whichever way round the players are asked for', async () => {
    interface H2H {
      headToHead: {
        player1Wins: number;
        player2Wins: number;
        draws: number;
        recentResults: Array<{ matchId: string; winnerId: string }>;
      };
    }
    const ask = (player1Id: string, player2Id: string) =>
      call<H2H>(getStatistics, makeEvent({
        queryStringParameters: { section: 'head-to-head', player1Id, player2Id },
      }));

    const forward = (await ask(crow, kai)).body.headToHead;
    const reverse = (await ask(kai, crow)).body.headToHead;

    expect(forward).toMatchObject({ player1Wins: 2, player2Wins: 0, draws: 1 });
    expect(reverse).toMatchObject({ player1Wins: 0, player2Wins: 2, draws: 1 });
    expect(forward.recentResults).toEqual(reverse.recentResults);
    expect(forward.recentResults.find((r) => r.matchId === 'm2')?.winnerId).toBe('');
  });

  it('counts as a draw on the player statistics route', async () => {
    const { body } = await call<{ overall: Stats }>(
      getPlayerStatistics,
      makeEvent({ pathParameters: { playerId: crow } }),
    );

    expect(body.overall).toMatchObject({ wins: 2, losses: 0, draws: 1 });
  });

  it('does not add to auto award wins or streaks', async () => {
    const matches = await repos.competition.matches.list();
    const players = await repos.roster.players.list();
    const awards = computeAutoAwards(
      's1',
      matches as unknown as Parameters<typeof computeAutoAwards>[1],
      players,
      [],
    );

    expect(awards.find((a) => a.awardType === 'mvp')).toMatchObject({ playerId: crow, value: '2 wins' });
    expect(awards.find((a) => a.awardId === 'auto-longest-win-streak')).toBeUndefined();
  });

  it('counts as a draw for both players in match-history rivalries', async () => {
    const { body } = await call<{ rivalries: Array<{ player1Wins: number; player2Wins: number; draws: number }> }>(
      getMatchHistoryRivalries,
      makeEvent(),
    );

    expect(body.rivalries[0]).toMatchObject({ player1Wins: 2, player2Wins: 0, draws: 1 });
  });

  it('counts as a draw in the commentary multi-man record', async () => {
    const third = (await repos.roster.players.create({ name: 'Third', currentWrestler: 'Kane' })).playerId;
    await addMatch('m4', '2026-01-04', [crow, kai, third], [crow, kai, third], [], true);
    const { eventId } = await repos.leagueOps.events.create({
      name: 'Show',
      eventType: 'ppv',
      date: '2026-02-01',
    });
    await repos.leagueOps.events.update(eventId, {
      matchCards: [{ position: 1, matchId: 'm4', designation: 'midcard' }],
    });

    const { body } = await call<{
      matches: Array<{ participants: Array<{ playerId: string; multiManRecord: { wins: number; draws: number } }> }>;
    }>(getCommentary, makeEvent({ pathParameters: { eventId } }));

    const participant = body.matches[0].participants.find((p) => p.playerId === crow);
    expect(participant?.multiManRecord).toMatchObject({ wins: 0, draws: 1 });
  });

  it('stays in the stored winners, which recordResult and deleteMatch rely on', async () => {
    await call(getStatistics, makeEvent({ queryStringParameters: { section: 'leaderboards' } }));

    const match = (await repos.competition.matches.list()).find((m) => m.matchId === 'm2');
    expect(match?.winners).toEqual([crow, kai]);
  });
});
