import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent } from './testHelpers';

const mockMatches = { list: vi.fn() };
const mockPlayers = { list: vi.fn() };

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: { matches: mockMatches },
    roster: { players: mockPlayers },
  }),
}));

import { handler as getMatchHistoryRivalries } from '../getMatchHistoryRivalries';

function completed(matchId: string, participants: string[], winners: string[], extra = {}) {
  return { matchId, date: `2026-04-0${matchId.slice(1)}`, status: 'completed', participants, winners, ...extra };
}

async function firstRivalry() {
  const result = await getMatchHistoryRivalries(makeEvent(), ctx, cb);
  expect(result!.statusCode).toBe(200);
  return JSON.parse(result!.body).rivalries[0];
}

describe('getMatchHistoryRivalries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayers.list.mockResolvedValue([
      { playerId: 'p1', name: 'One', currentWrestler: 'Cena' },
      { playerId: 'p2', name: 'Two', currentWrestler: 'Orton' },
    ]);
  });

  it('credits each win to the winner when participant order differs', async () => {
    mockMatches.list.mockResolvedValue([
      completed('m1', ['p1', 'p2'], ['p1']),
      completed('m2', ['p2', 'p1'], ['p1']),
      completed('m3', ['p2', 'p1'], ['p1']),
      completed('m4', ['p2', 'p1'], ['p2']),
    ]);

    const rivalry = await firstRivalry();

    expect(rivalry).toMatchObject({
      player1Id: 'p1',
      player2Id: 'p2',
      player1Wins: 3,
      player2Wins: 1,
      draws: 0,
      matchCount: 4,
    });
  });

  it('counts a draw with reversed participants as neither player\'s win', async () => {
    mockMatches.list.mockResolvedValue([
      completed('m1', ['p1', 'p2'], ['p2']),
      completed('m2', ['p2', 'p1'], ['p2', 'p1'], { isDraw: true }),
      completed('m3', ['p2', 'p1'], ['p2']),
    ]);

    const rivalry = await firstRivalry();

    expect(rivalry).toMatchObject({ player1Wins: 0, player2Wins: 2, draws: 1 });
  });
});
