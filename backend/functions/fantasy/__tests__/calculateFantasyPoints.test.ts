import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks ----------------------------------------------------------------

const { mockGet, mockQuery, mockUpdate } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockQuery: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: {
    get: mockGet,
    put: vi.fn(),
    scan: vi.fn(),
    query: mockQuery,
    update: mockUpdate,
    delete: vi.fn(),
    scanAll: vi.fn(),
    queryAll: vi.fn(),
  },
  TableNames: {
    EVENTS: 'Events',
    FANTASY_CONFIG: 'FantasyConfig',
    FANTASY_PICKS: 'FantasyPicks',
    MATCHES: 'Matches',
  },
}));

import { calculateFantasyPoints } from '../calculateFantasyPoints';

// ---- Tests -----------------------------------------------------------------

describe('calculateFantasyPoints', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns early when event not found', async () => {
    mockGet.mockResolvedValueOnce({ Item: undefined });

    await calculateFantasyPoints('e1');

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns early when event has no matchCards', async () => {
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1', matchCards: [] } });

    await calculateFantasyPoints('e1');

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns early when no picks exist for event', async () => {
    // Event with matches
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    // Config
    mockGet.mockResolvedValueOnce({ Item: {} });
    // Match query
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'] }],
    });
    // Picks query
    mockQuery.mockResolvedValueOnce({ Items: [] });

    await calculateFantasyPoints('e1');

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('awards base points = (participants - 1) * baseWinPoints for a win', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    mockGet.mockResolvedValueOnce({ Item: { baseWinPoints: 10 } });
    // 2-person match: winner p1, loser p2
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'] }],
    });
    // One user picked p1
    mockQuery.mockResolvedValueOnce({
      Items: [{ eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } }],
    });
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateCall = mockUpdate.mock.calls[0][0];
    // (2 participants - 1) * 10 = 10
    expect(updateCall.ExpressionAttributeValues[':pts']).toBe(10);
  });

  it('scales points with match size (3-person match)', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    mockGet.mockResolvedValueOnce({ Item: { baseWinPoints: 10 } });
    // 3-person match
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2', 'p3'] }],
    });
    mockQuery.mockResolvedValueOnce({
      Items: [{ eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } }],
    });
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    const updateCall = mockUpdate.mock.calls[0][0];
    // (3 - 1) * 10 = 20
    expect(updateCall.ExpressionAttributeValues[':pts']).toBe(20);
  });

  it('adds championship bonus for championship match win', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    mockGet.mockResolvedValueOnce({ Item: { baseWinPoints: 10, championshipBonus: 5, titleWinBonus: 10 } });
    mockQuery.mockResolvedValueOnce({
      Items: [{
        matchId: 'm1', status: 'completed', isChampionship: true,
        winners: ['p1'], losers: ['p2'],
      }],
    });
    mockQuery.mockResolvedValueOnce({
      Items: [{ eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } }],
    });
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    const updateCall = mockUpdate.mock.calls[0][0];
    // base (2-1)*10=10 + championship 5 + titleWin 10 = 25
    expect(updateCall.ExpressionAttributeValues[':pts']).toBe(25);
  });

  it('awards title defense bonus instead of title win when isTitleDefense', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    mockGet.mockResolvedValueOnce({
      Item: { baseWinPoints: 10, championshipBonus: 5, titleWinBonus: 10, titleDefenseBonus: 5 },
    });
    mockQuery.mockResolvedValueOnce({
      Items: [{
        matchId: 'm1', status: 'completed', isChampionship: true, isTitleDefense: true,
        winners: ['p1'], losers: ['p2'],
      }],
    });
    mockQuery.mockResolvedValueOnce({
      Items: [{ eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } }],
    });
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    const updateCall = mockUpdate.mock.calls[0][0];
    // base 10 + championship 5 + defense 5 = 20
    expect(updateCall.ExpressionAttributeValues[':pts']).toBe(20);
  });

  it('gives 0 points for a wrestler who did not compete', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    mockGet.mockResolvedValueOnce({ Item: {} });
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm1', status: 'completed', winners: ['p2'], losers: ['p3'] }],
    });
    mockQuery.mockResolvedValueOnce({
      Items: [{ eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } }],
    });
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.ExpressionAttributeValues[':pts']).toBe(0);
    const breakdown = updateCall.ExpressionAttributeValues[':bd'];
    expect(breakdown.p1.reason).toBe('Did not compete');
    expect(breakdown.p1.points).toBe(0);
  });

  it('gives 0 points with "Lost match" for a wrestler who lost', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    mockGet.mockResolvedValueOnce({ Item: { baseWinPoints: 10 } });
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm1', status: 'completed', winners: ['p2'], losers: ['p1'] }],
    });
    mockQuery.mockResolvedValueOnce({
      Items: [{ eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } }],
    });
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.ExpressionAttributeValues[':pts']).toBe(0);
    const breakdown = updateCall.ExpressionAttributeValues[':bd'];
    expect(breakdown.p1.reason).toBe('Lost match');
  });

  it('stores breakdown per wrestler in the update', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    mockGet.mockResolvedValueOnce({ Item: { baseWinPoints: 10 } });
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'] }],
    });
    mockQuery.mockResolvedValueOnce({
      Items: [{ eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1', 'p2'] } }],
    });
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    const breakdown = mockUpdate.mock.calls[0][0].ExpressionAttributeValues[':bd'];
    expect(breakdown.p1).toBeDefined();
    expect(breakdown.p1.points).toBe(10);
    expect(breakdown.p1.multipliers).toEqual(expect.any(Array));
    expect(breakdown.p2).toBeDefined();
    expect(breakdown.p2.points).toBe(0);
  });

  it('only counts completed matches', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }, { matchId: 'm2' }] },
    });
    mockGet.mockResolvedValueOnce({ Item: { baseWinPoints: 10 } });
    // m1 is completed, m2 is still in-progress
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'] }],
    });
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm2', status: 'in-progress', winners: [], losers: [] }],
    });
    mockQuery.mockResolvedValueOnce({
      Items: [{ eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } }],
    });
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    const pts = mockUpdate.mock.calls[0][0].ExpressionAttributeValues[':pts'];
    // Only m1 counted: (2-1)*10 = 10
    expect(pts).toBe(10);
  });

  it('uses config defaults when config has no values', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    // Empty config -- should fall back to defaults
    mockGet.mockResolvedValueOnce({ Item: undefined });
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'] }],
    });
    mockQuery.mockResolvedValueOnce({
      Items: [{ eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } }],
    });
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    // Default baseWinPoints = 10, (2-1)*10 = 10
    expect(mockUpdate.mock.calls[0][0].ExpressionAttributeValues[':pts']).toBe(10);
  });

  it('processes multiple users picks in a single event', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    mockGet.mockResolvedValueOnce({ Item: { baseWinPoints: 10 } });
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'] }],
    });
    mockQuery.mockResolvedValueOnce({
      Items: [
        { eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } },
        { eventId: 'e1', fantasyUserId: 'u2', picks: { d1: ['p2'] } },
      ],
    });
    mockUpdate.mockResolvedValueOnce({});
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    // u1 picked winner: 10, u2 picked loser: 0
    expect(mockUpdate.mock.calls[0][0].ExpressionAttributeValues[':pts']).toBe(10);
    expect(mockUpdate.mock.calls[1][0].ExpressionAttributeValues[':pts']).toBe(0);
  });

  it('handles event with matchCards undefined (falls back to empty array)', async () => {
    // Event exists but has NO matchCards property at all
    mockGet.mockResolvedValueOnce({ Item: { eventId: 'e1' } });

    await calculateFantasyPoints('e1');

    // The || [] fallback makes matchIds empty, triggering "has no matches" early return
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('handles match with missing winners/losers arrays (defaults to empty)', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    mockGet.mockResolvedValueOnce({ Item: { baseWinPoints: 10 } });
    // Completed match WITHOUT winners or losers properties
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm1', status: 'completed' }],
    });
    // One user picked player p1
    mockQuery.mockResolvedValueOnce({
      Items: [{ eventId: 'e1', fantasyUserId: 'u1', picks: { d1: ['p1'] } }],
    });
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateCall = mockUpdate.mock.calls[0][0];
    // No winners/losers means playerMatchMap is empty, so p1 "Did not compete"
    expect(updateCall.ExpressionAttributeValues[':pts']).toBe(0);
    const breakdown = updateCall.ExpressionAttributeValues[':bd'];
    expect(breakdown.p1.reason).toBe('Did not compete');
    expect(breakdown.p1.points).toBe(0);
  });

  it('handles pick record with undefined picks object (defaults to empty)', async () => {
    mockGet.mockResolvedValueOnce({
      Item: { eventId: 'e1', matchCards: [{ matchId: 'm1' }] },
    });
    mockGet.mockResolvedValueOnce({ Item: { baseWinPoints: 10 } });
    mockQuery.mockResolvedValueOnce({
      Items: [{ matchId: 'm1', status: 'completed', winners: ['p1'], losers: ['p2'] }],
    });
    // Pick record WITHOUT a picks property
    mockQuery.mockResolvedValueOnce({
      Items: [{ eventId: 'e1', fantasyUserId: 'u1' }],
    });
    mockUpdate.mockResolvedValueOnce({});

    await calculateFantasyPoints('e1');

    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateCall = mockUpdate.mock.calls[0][0];
    // The || {} fallback makes Object.values(picks) return [], so totalPoints = 0
    expect(updateCall.ExpressionAttributeValues[':pts']).toBe(0);
    expect(updateCall.ExpressionAttributeValues[':bd']).toEqual({});
  });
});
