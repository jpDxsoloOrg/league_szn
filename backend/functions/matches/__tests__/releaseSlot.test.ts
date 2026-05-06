import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const {
  mockMatchesFindByIdWithDate,
  mockPlayersFindByUserId,
  mockRunInTransaction,
} = vi.hoisted(() => ({
  mockMatchesFindByIdWithDate: vi.fn(),
  mockPlayersFindByUserId: vi.fn(),
  mockRunInTransaction: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      matches: { findByIdWithDate: mockMatchesFindByIdWithDate },
    },
    roster: {
      players: { findByUserId: mockPlayersFindByUserId },
    },
    runInTransaction: mockRunInTransaction,
  }),
}));

import { handler as releaseSlot } from '../releaseSlot';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

function ev(
  overrides: Partial<APIGatewayProxyEvent> = {},
  groups = 'Wrestler',
): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'DELETE',
    isBase64Encoded: false,
    path: '/',
    pathParameters: { matchId: 'm1', slotId: 's1' },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: { groups, principalId: 'sub-1', username: 't', email: 't@t' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    matchId: 'm1',
    date: '2024-06-01T00:00:00Z',
    matchFormat: 'Singles',
    status: 'scheduled',
    participants: ['p-caller', 'p-other'],
    slots: [
      { slotId: 's1', position: 1, playerId: 'p-caller', claimedAt: '2024-05-30T00:00:00Z' },
      { slotId: 's2', position: 2, playerId: 'p-other', claimedAt: '2024-05-30T00:00:00Z' },
    ],
    slotsRequired: 2,
    ...overrides,
  };
}

interface FakeTx { updateMatch: ReturnType<typeof vi.fn>; }
function captureTx(): FakeTx {
  const tx: FakeTx = { updateMatch: vi.fn() };
  mockRunInTransaction.mockImplementation(async (fn: (tx: FakeTx) => Promise<unknown>) => {
    await fn(tx);
  });
  return tx;
}

// ---- Tests -----------------------------------------------------------------

describe('releaseSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayersFindByUserId.mockResolvedValue({ playerId: 'p-caller' });
  });

  it('claimant releases own slot — flips status back to open-signups', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch());
    const tx = captureTx();

    const r = await releaseSlot(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.status).toBe('open-signups');
    expect(b.slots[0].playerId).toBeUndefined();
    expect(b.slots[0].claimedAt).toBeUndefined();
    expect(b.participants).toEqual(['p-other']);
    expect(tx.updateMatch).toHaveBeenCalledWith(
      'm1',
      '2024-06-01T00:00:00Z',
      expect.objectContaining({ status: 'open-signups' }),
    );
  });

  it('preserves slot lockedByAdmin flag and teamLabel after release', async () => {
    // Admin releasing a locked slot keeps the lock metadata so a re-claim
    // by a non-admin still hits the locked check.
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        slots: [
          {
            slotId: 's1',
            position: 1,
            playerId: 'p-caller',
            claimedAt: '2024-05-30T00:00:00Z',
            lockedByAdmin: true,
            teamLabel: 'A',
          },
          { slotId: 's2', position: 2 },
        ],
      }),
    );
    captureTx();

    const r = await releaseSlot(ev({}, 'Admin'), ctx, cb);

    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.slots[0].lockedByAdmin).toBe(true);
    expect(b.slots[0].teamLabel).toBe('A');
    expect(b.slots[0].playerId).toBeUndefined();
  });

  it('non-admin cannot release someone else’s slot', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        slots: [
          { slotId: 's1', position: 1, playerId: 'p-other', claimedAt: '2024-05-30T00:00:00Z' },
          { slotId: 's2', position: 2, playerId: 'p-caller', claimedAt: '2024-05-30T00:00:00Z' },
        ],
      }),
    );

    const r = await releaseSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(403);
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('admin (Moderator) can release any slot', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        slots: [
          { slotId: 's1', position: 1, playerId: 'p-other', claimedAt: '2024-05-30T00:00:00Z' },
          { slotId: 's2', position: 2, playerId: 'p-caller', claimedAt: '2024-05-30T00:00:00Z' },
        ],
      }),
    );
    captureTx();

    const r = await releaseSlot(ev({}, 'Moderator'), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.slots[0].playerId).toBeUndefined();
  });

  it('non-admin cannot release a locked slot even when occupying it', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        slots: [
          { slotId: 's1', position: 1, playerId: 'p-caller', claimedAt: '2024-05-30T00:00:00Z', lockedByAdmin: true },
          { slotId: 's2', position: 2, playerId: 'p-other', claimedAt: '2024-05-30T00:00:00Z' },
        ],
      }),
    );

    const r = await releaseSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(403);
  });

  it('releasing an already-empty slot is an idempotent success', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        status: 'open-signups',
        slots: [
          { slotId: 's1', position: 1 },
          { slotId: 's2', position: 2, playerId: 'p-other', claimedAt: '2024-05-30T00:00:00Z' },
        ],
      }),
    );

    const r = await releaseSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('refuses to release on completed matches', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch({ status: 'completed' }));
    const r = await releaseSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(409);
  });

  it('refuses to release on cancelled matches', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch({ status: 'cancelled' }));
    const r = await releaseSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(409);
  });

  it('returns 404 when match is not found', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(null);
    const r = await releaseSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(404);
  });

  it('returns 404 when slot is not found', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch());
    const r = await releaseSlot(ev({ pathParameters: { matchId: 'm1', slotId: 'unknown' } }), ctx, cb);
    expect(r!.statusCode).toBe(404);
  });
});
