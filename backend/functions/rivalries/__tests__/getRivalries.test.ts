import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent } from './testHelpers';

const mockRivalries = {
  listByParticipant: vi.fn(),
  listByStatus: vi.fn(),
};
const mockMatches = { list: vi.fn() };

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    competition: { matches: mockMatches },
  }),
}));

import { handler as getRivalriesList } from '../getRivalries';

function makeRivalry(overrides: Record<string, unknown> = {}) {
  return {
    rivalryId: 'r1',
    title: 'feud',
    status: 'active',
    heat: 'warm',
    requestedBy: 'p1',
    participants: [
      { playerId: 'p1', role: 'instigator', addedAt: '' },
      { playerId: 'p2', role: 'rival', addedAt: '' },
    ],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    moderationNote: 'private',
    ...overrides,
  };
}

describe('getRivalries (list)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMatches.list.mockResolvedValue([]);
  });

  it('defaults to active rivalries when no filter is provided', async () => {
    mockRivalries.listByStatus.mockResolvedValue({ items: [makeRivalry()], nextCursor: undefined });
    const res = await getRivalriesList(makeEvent({ httpMethod: 'GET' }), ctx, cb);
    expect(res!.statusCode).toBe(200);
    expect(mockRivalries.listByStatus).toHaveBeenCalledWith('active', expect.any(Object));
  });

  it('uses ParticipantIndex when participantId is given', async () => {
    mockRivalries.listByParticipant.mockResolvedValue({ items: [makeRivalry()], nextCursor: undefined });
    const res = await getRivalriesList(
      makeEvent({ httpMethod: 'GET', queryStringParameters: { participantId: 'p1' } }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(200);
    expect(mockRivalries.listByParticipant).toHaveBeenCalledWith('p1', expect.any(Object));
    expect(mockRivalries.listByStatus).not.toHaveBeenCalled();
  });

  it('rejects unknown status values', async () => {
    const res = await getRivalriesList(
      makeEvent({ httpMethod: 'GET', queryStringParameters: { status: 'bogus' } }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(400);
  });

  it('strips moderationNote from the response', async () => {
    mockRivalries.listByStatus.mockResolvedValue({ items: [makeRivalry()], nextCursor: undefined });
    const res = await getRivalriesList(makeEvent({ httpMethod: 'GET' }), ctx, cb);
    const body = JSON.parse(res!.body);
    expect(body.rivalries[0].moderationNote).toBeUndefined();
  });

  it('filters by seasonId via participant-pair match-history join', async () => {
    mockRivalries.listByStatus.mockResolvedValue({
      items: [
        makeRivalry({ rivalryId: 'r1', participants: [
          { playerId: 'p1', role: 'instigator', addedAt: '' },
          { playerId: 'p2', role: 'rival', addedAt: '' },
        ]}),
        makeRivalry({ rivalryId: 'r2', participants: [
          { playerId: 'p3', role: 'instigator', addedAt: '' },
          { playerId: 'p4', role: 'rival', addedAt: '' },
        ]}),
      ],
      nextCursor: undefined,
    });
    mockMatches.list.mockResolvedValue([
      { matchId: 'm1', seasonId: 's1', participants: ['p1', 'p2'] },
      { matchId: 'm2', seasonId: 's2', participants: ['p3', 'p4'] },
    ]);
    const res = await getRivalriesList(
      makeEvent({ httpMethod: 'GET', queryStringParameters: { seasonId: 's1' } }),
      ctx,
      cb,
    );
    const body = JSON.parse(res!.body);
    expect(body.rivalries.map((r: { rivalryId: string }) => r.rivalryId)).toEqual(['r1']);
  });
});
