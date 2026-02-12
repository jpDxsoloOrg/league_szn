import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const { mockGet, mockScan, mockQuery, mockUpdate, mockTransactWrite } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockScan: vi.fn(),
  mockQuery: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransactWrite: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet, put: vi.fn(), scan: mockScan, query: mockQuery,
    update: mockUpdate, delete: vi.fn(), scanAll: vi.fn(), queryAll: vi.fn(),
    transactWrite: mockTransactWrite,
  },
  TableNames: {
    MATCHES: 'Matches', PLAYERS: 'Players', CHAMPIONSHIPS: 'Championships',
    CHAMPIONSHIP_HISTORY: 'ChampionshipHistory', TOURNAMENTS: 'Tournaments',
    SEASONS: 'Seasons', SEASON_STANDINGS: 'SeasonStandings',
    EVENTS: 'Events', CONTENDER_RANKINGS: 'ContenderRankings',
  },
}));

vi.mock('../../../lib/rankingCalculator', () => ({
  calculateRankingsForChampionship: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../fantasy/recalculateWrestlerCosts', () => ({
  recalculateCosts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../fantasy/calculateFantasyPoints', () => ({
  calculateFantasyPoints: vi.fn().mockResolvedValue(undefined),
}));

import { handler as recordResult } from '../recordResult';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};
const base = { matchId: 'm1', date: '2024-06-01', status: 'pending', participants: ['p1', 'p2'] };

function ev(body: object): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body), headers: {}, multiValueHeaders: {},
    httpMethod: 'POST', isBase64Encoded: false, path: '/',
    pathParameters: { matchId: 'm1' }, queryStringParameters: null,
    multiValueQueryStringParameters: null, stageVariables: null,
    resource: '', requestContext: { authorizer: {} } as any,
  };
}

function tournUpdate() {
  return mockUpdate.mock.calls.find((c: any) => c[0].Key?.tournamentId === 't1');
}

// ---- Round-Robin Tests -----------------------------------------------------

describe('recordResult — round-robin tournament', () => {
  beforeEach(() => vi.clearAllMocks());

  function stubRR(standings: Record<string, any>, participants: string[], status = 'in-progress') {
    mockQuery.mockResolvedValue({ Items: [{ ...base, tournamentId: 't1' }] });
    mockTransactWrite.mockResolvedValue({});
    mockGet.mockResolvedValue({
      Item: { tournamentId: 't1', type: 'round-robin', standings, participants, status },
    });
    mockUpdate.mockResolvedValue({});
    mockScan.mockResolvedValue({ Items: [] });
  }

  it('updates standings: winner +1 win/+2 pts, loser +1 loss/+0 pts', async () => {
    stubRR(
      { p1: { wins: 0, losses: 0, draws: 0, points: 0 }, p2: { wins: 0, losses: 0, draws: 0, points: 0 } },
      ['p1', 'p2', 'p3'],
    );
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    const s = tournUpdate()![0].ExpressionAttributeValues[':standings'];
    expect(s.p1).toMatchObject({ wins: 1, points: 2 });
    expect(s.p2).toMatchObject({ losses: 1, points: 0 });
  });

  // Note: Draw detection requires winners === losers (sorted), but the overlap
  // validation returns 400 before reaching draw logic. Draw paths are unreachable.

  it('does not complete tournament when totalMatchesPlayed formula has not reached threshold', async () => {
    // The completion formula uses (wins + draws) / 2 which only counts wins at half-rate.
    // 3 participants = 3 expected matches, but 3 wins / 2 = 1.5 < 3, so stays in-progress.
    stubRR(
      {
        p1: { wins: 2, losses: 0, draws: 0, points: 4 },
        p2: { wins: 0, losses: 1, draws: 0, points: 0 },
        p3: { wins: 0, losses: 1, draws: 0, points: 0 },
      },
      ['p1', 'p2', 'p3'],
    );
    await recordResult(ev({ winners: ['p2'], losers: ['p3'] }), ctx, cb);

    const vals = tournUpdate()![0].ExpressionAttributeValues;
    expect(vals[':status']).toBe('in-progress');
  });

  it('transitions from upcoming to in-progress on first result', async () => {
    stubRR({}, ['p1', 'p2', 'p3'], 'upcoming');
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(tournUpdate()![0].ExpressionAttributeValues[':status']).toBe('in-progress');
  });

  it('initializes standings for new participants not yet in standings', async () => {
    stubRR({}, ['p1', 'p2', 'p3']);
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    const s = tournUpdate()![0].ExpressionAttributeValues[':standings'];
    expect(s.p1).toBeDefined();
    expect(s.p2).toBeDefined();
  });
});

// ---- Single Elimination Tests ----------------------------------------------

describe('recordResult — single-elimination tournament', () => {
  beforeEach(() => vi.clearAllMocks());

  function stubSE(brackets: any, status = 'in-progress') {
    mockQuery.mockResolvedValue({ Items: [{ ...base, tournamentId: 't1', participants: ['p1', 'p2'] }] });
    mockTransactWrite.mockResolvedValue({});
    mockGet.mockResolvedValue({
      Item: { tournamentId: 't1', type: 'single-elimination', brackets, status },
    });
    mockUpdate.mockResolvedValue({});
    mockScan.mockResolvedValue({ Items: [] });
  }

  it('advances winner to next round (first of pair -> participant1)', async () => {
    stubSE({
      rounds: [
        { matches: [{ participant1: 'p1', participant2: 'p2' }, { participant1: 'p3', participant2: 'p4' }] },
        { matches: [{ participant1: null, participant2: null }] },
      ],
    });
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    const b = tournUpdate()![0].ExpressionAttributeValues[':brackets'];
    expect(b.rounds[1].matches[0].participant1).toBe('p1');
  });

  it('advances second-of-pair winner to participant2 in next round', async () => {
    const match = { ...base, tournamentId: 't1', participants: ['p3', 'p4'] };
    mockQuery.mockResolvedValue({ Items: [match] });
    mockTransactWrite.mockResolvedValue({});
    mockGet.mockResolvedValue({
      Item: {
        tournamentId: 't1', type: 'single-elimination', status: 'in-progress',
        brackets: {
          rounds: [
            { matches: [{ participant1: 'p1', participant2: 'p2', winner: 'p1' }, { participant1: 'p3', participant2: 'p4' }] },
            { matches: [{ participant1: 'p1', participant2: null }] },
          ],
        },
      },
    });
    mockUpdate.mockResolvedValue({});
    mockScan.mockResolvedValue({ Items: [] });

    await recordResult(ev({ winners: ['p3'], losers: ['p4'] }), ctx, cb);

    const b = tournUpdate()![0].ExpressionAttributeValues[':brackets'];
    expect(b.rounds[1].matches[0].participant2).toBe('p3');
  });

  it('completes tournament when final round match decided', async () => {
    stubSE({
      rounds: [{ matches: [{ participant1: 'p1', participant2: 'p2' }] }],
    });
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    const vals = tournUpdate()![0].ExpressionAttributeValues;
    expect(vals[':status']).toBe('completed');
    expect(vals[':winner']).toBe('p1');
  });

  it('transitions from upcoming to in-progress on first bracket result', async () => {
    stubSE({
      rounds: [
        { matches: [{ participant1: 'p1', participant2: 'p2' }, { participant1: 'p3', participant2: 'p4' }] },
        { matches: [{ participant1: null, participant2: null }] },
      ],
    }, 'upcoming');
    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    expect(tournUpdate()![0].ExpressionAttributeValues[':status']).toBe('in-progress');
  });
});

// ---- Event Auto-Complete Tests ---------------------------------------------

describe('recordResult — event auto-complete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks event completed when all matches are done', async () => {
    mockQuery
      .mockResolvedValueOnce({ Items: [base] }) // match lookup
      .mockResolvedValueOnce({ Items: [{ matchId: 'm1', status: 'completed' }] })
      .mockResolvedValueOnce({ Items: [{ matchId: 'm2', status: 'completed' }] });
    mockTransactWrite.mockResolvedValue({});
    mockScan.mockImplementation(async (params: any) => {
      if (params.TableName === 'Events')
        return { Items: [{ eventId: 'e1', status: 'upcoming', matchCards: [{ matchId: 'm1' }, { matchId: 'm2' }] }] };
      return { Items: [] };
    });
    mockUpdate.mockResolvedValue({});

    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    const completed = mockUpdate.mock.calls.find(
      (c: any) => c[0].Key?.eventId === 'e1' && c[0].ExpressionAttributeValues?.[':completed'],
    );
    expect(completed).toBeDefined();
  });

  it('marks upcoming event as in-progress when some matches still pending', async () => {
    mockQuery
      .mockResolvedValueOnce({ Items: [base] })
      .mockResolvedValueOnce({ Items: [{ matchId: 'm1', status: 'completed' }] })
      .mockResolvedValueOnce({ Items: [{ matchId: 'm2', status: 'scheduled' }] });
    mockTransactWrite.mockResolvedValue({});
    mockScan.mockImplementation(async (params: any) => {
      if (params.TableName === 'Events')
        return { Items: [{ eventId: 'e1', status: 'upcoming', matchCards: [{ matchId: 'm1' }, { matchId: 'm2' }] }] };
      return { Items: [] };
    });
    mockUpdate.mockResolvedValue({});

    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    const inProg = mockUpdate.mock.calls.find(
      (c: any) => c[0].Key?.eventId === 'e1' && c[0].ExpressionAttributeValues?.[':inProgress'],
    );
    expect(inProg).toBeDefined();
  });

  it('does not change status for already in-progress event with pending matches', async () => {
    mockQuery
      .mockResolvedValueOnce({ Items: [base] })
      .mockResolvedValueOnce({ Items: [{ matchId: 'm1', status: 'completed' }] })
      .mockResolvedValueOnce({ Items: [{ matchId: 'm2', status: 'scheduled' }] });
    mockTransactWrite.mockResolvedValue({});
    mockScan.mockImplementation(async (params: any) => {
      if (params.TableName === 'Events')
        return { Items: [{ eventId: 'e1', status: 'in-progress', matchCards: [{ matchId: 'm1' }, { matchId: 'm2' }] }] };
      return { Items: [] };
    });
    mockUpdate.mockResolvedValue({});

    await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);

    // Should NOT update event status since it is already in-progress
    const eventUpdate = mockUpdate.mock.calls.find(
      (c: any) => c[0].Key?.eventId === 'e1',
    );
    expect(eventUpdate).toBeUndefined();
  });

  it('succeeds even if auto-complete throws', async () => {
    mockQuery.mockResolvedValueOnce({ Items: [base] });
    mockTransactWrite.mockResolvedValue({});
    // Scan throws for events
    mockScan.mockImplementation(async (params: any) => {
      if (params.TableName === 'Events') throw new Error('event scan fail');
      return { Items: [] };
    });

    const r = await recordResult(ev({ winners: ['p1'], losers: ['p2'] }), ctx, cb);
    expect(r!.statusCode).toBe(200);
  });
});
