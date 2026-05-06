import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const {
  mockMatchesFindByIdWithDate,
  mockPlayersFindById,
  mockRunInTransaction,
} = vi.hoisted(() => ({
  mockMatchesFindByIdWithDate: vi.fn(),
  mockPlayersFindById: vi.fn(),
  mockRunInTransaction: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      matches: { findByIdWithDate: mockMatchesFindByIdWithDate },
    },
    roster: {
      players: { findById: mockPlayersFindById },
    },
    runInTransaction: mockRunInTransaction,
  }),
}));

import { handler as adminUpdateSlot } from '../adminUpdateSlot';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

function ev(
  body: Record<string, unknown>,
  overrides: Partial<APIGatewayProxyEvent> = {},
  groups = 'Admin',
): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'PUT',
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
    status: 'open-signups',
    participants: [],
    slots: [
      { slotId: 's1', position: 1 },
      { slotId: 's2', position: 2 },
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

describe('adminUpdateSlot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('force-assigns a player into an empty slot', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch());
    mockPlayersFindById.mockResolvedValue({ playerId: 'p1' });
    captureTx();

    const r = await adminUpdateSlot(ev({ playerId: 'p1' }), ctx, cb);

    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.slots[0].playerId).toBe('p1');
    expect(b.slots[0].claimedAt).toBeDefined();
    expect(b.participants).toEqual(['p1']);
  });

  it('force-assigns over an existing claimant (replaces the prior occupant)', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        status: 'scheduled',
        slots: [
          { slotId: 's1', position: 1, playerId: 'p-old', claimedAt: '2024-05-30T00:00:00Z' },
          { slotId: 's2', position: 2, playerId: 'p2', claimedAt: '2024-05-30T00:00:00Z' },
        ],
        participants: ['p-old', 'p2'],
      }),
    );
    mockPlayersFindById.mockResolvedValue({ playerId: 'p-new' });
    captureTx();

    const r = await adminUpdateSlot(ev({ playerId: 'p-new' }), ctx, cb);

    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.slots[0].playerId).toBe('p-new');
    expect(b.participants).toEqual(['p-new', 'p2']);
    expect(b.status).toBe('scheduled');
  });

  it('clears a slot when playerId is null', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        status: 'scheduled',
        slots: [
          { slotId: 's1', position: 1, playerId: 'p1', claimedAt: '2024-05-30T00:00:00Z' },
          { slotId: 's2', position: 2, playerId: 'p2', claimedAt: '2024-05-30T00:00:00Z' },
        ],
        participants: ['p1', 'p2'],
      }),
    );
    captureTx();

    const r = await adminUpdateSlot(ev({ playerId: null }), ctx, cb);

    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.slots[0].playerId).toBeUndefined();
    expect(b.slots[0].claimedAt).toBeUndefined();
    expect(b.status).toBe('open-signups');
    expect(b.participants).toEqual(['p2']);
  });

  it('locks an existing slot without changing playerId', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        slots: [
          { slotId: 's1', position: 1, playerId: 'p1', claimedAt: '2024-05-30T00:00:00Z' },
          { slotId: 's2', position: 2 },
        ],
        participants: ['p1'],
      }),
    );
    captureTx();

    const r = await adminUpdateSlot(ev({ lockedByAdmin: true }), ctx, cb);

    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.slots[0].lockedByAdmin).toBe(true);
    expect(b.slots[0].playerId).toBe('p1');
    expect(b.slots[0].claimedAt).toBe('2024-05-30T00:00:00Z'); // preserved
  });

  it('unlocks a locked slot when lockedByAdmin: false', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        slots: [
          { slotId: 's1', position: 1, lockedByAdmin: true },
          { slotId: 's2', position: 2 },
        ],
      }),
    );
    captureTx();

    const r = await adminUpdateSlot(ev({ lockedByAdmin: false }), ctx, cb);

    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.slots[0].lockedByAdmin).toBeUndefined();
  });

  it('returns 404 when target player does not exist', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch());
    mockPlayersFindById.mockResolvedValue(null);

    const r = await adminUpdateSlot(ev({ playerId: 'ghost' }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(JSON.parse(r!.body).message).toContain('Player not found');
  });

  it('returns 404 when slot is not found', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch());
    const r = await adminUpdateSlot(
      ev({ playerId: 'p1' }, { pathParameters: { matchId: 'm1', slotId: 'unknown' } }),
      ctx,
      cb,
    );
    expect(r!.statusCode).toBe(404);
  });

  it('returns 404 when match is not found', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(null);
    const r = await adminUpdateSlot(ev({ playerId: 'p1' }), ctx, cb);
    expect(r!.statusCode).toBe(404);
  });

  it('keeps status when match is completed (does not auto-flip)', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        status: 'completed',
        slots: [
          { slotId: 's1', position: 1, playerId: 'p1', claimedAt: '2024-05-30T00:00:00Z' },
          { slotId: 's2', position: 2, playerId: 'p2', claimedAt: '2024-05-30T00:00:00Z' },
        ],
        participants: ['p1', 'p2'],
      }),
    );
    captureTx();

    const r = await adminUpdateSlot(ev({ teamLabel: 'A' }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.status).toBe('completed');
    expect(b.slots[0].teamLabel).toBe('A');
  });

  // ── MSL-03: wrestler choice + snapshot ─────────────────────────────────

  it('force-assigns with silent main default when wrestlerChoice omitted', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch());
    mockPlayersFindById.mockResolvedValue({
      playerId: 'p1',
      currentWrestler: 'Stone Cold',
      alternateWrestler: 'The Rock',
    });
    captureTx();

    const r = await adminUpdateSlot(ev({ playerId: 'p1' }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.slots[0].wrestlerChoice).toBe('main');
    expect(b.slots[0].wrestlerNameSnapshot).toBe('Stone Cold');
  });

  it('force-assigns with explicit wrestlerChoice="alternate"', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch());
    mockPlayersFindById.mockResolvedValue({
      playerId: 'p1',
      currentWrestler: 'Stone Cold',
      alternateWrestler: 'The Rock',
    });
    captureTx();

    const r = await adminUpdateSlot(
      ev({ playerId: 'p1', wrestlerChoice: 'alternate' }),
      ctx,
      cb,
    );
    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.slots[0].wrestlerChoice).toBe('alternate');
    expect(b.slots[0].wrestlerNameSnapshot).toBe('The Rock');
  });

  it('clearing a slot wipes wrestlerChoice and wrestlerNameSnapshot', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        status: 'scheduled',
        slots: [
          {
            slotId: 's1',
            position: 1,
            playerId: 'p1',
            claimedAt: '2024-05-30T00:00:00Z',
            wrestlerChoice: 'alternate',
            wrestlerNameSnapshot: 'The Rock',
          },
          { slotId: 's2', position: 2, playerId: 'p2', claimedAt: '2024-05-30T00:00:00Z' },
        ],
        participants: ['p1', 'p2'],
      }),
    );
    captureTx();

    const r = await adminUpdateSlot(ev({ playerId: null }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.slots[0].playerId).toBeUndefined();
    expect(b.slots[0].wrestlerChoice).toBeUndefined();
    expect(b.slots[0].wrestlerNameSnapshot).toBeUndefined();
  });

  it('switching wrestlerChoice without changing playerId recomputes the snapshot', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        status: 'scheduled',
        slots: [
          {
            slotId: 's1',
            position: 1,
            playerId: 'p1',
            claimedAt: '2024-05-30T00:00:00Z',
            wrestlerChoice: 'main',
            wrestlerNameSnapshot: 'Stone Cold',
          },
          { slotId: 's2', position: 2, playerId: 'p2', claimedAt: '2024-05-30T00:00:00Z' },
        ],
        participants: ['p1', 'p2'],
      }),
    );
    mockPlayersFindById.mockResolvedValue({
      playerId: 'p1',
      currentWrestler: 'Stone Cold',
      alternateWrestler: 'The Rock',
    });
    captureTx();

    const r = await adminUpdateSlot(ev({ wrestlerChoice: 'alternate' }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.slots[0].playerId).toBe('p1'); // unchanged
    expect(b.slots[0].wrestlerChoice).toBe('alternate');
    expect(b.slots[0].wrestlerNameSnapshot).toBe('The Rock');
  });
});
