import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Mocks ----------------------------------------------------------------

const {
  mockMatchesFindByIdWithDate,
  mockMatchesFindById,
  mockPlayersFindByUserId,
  mockEventsFindById,
  mockRunInTransaction,
} = vi.hoisted(() => ({
  mockMatchesFindByIdWithDate: vi.fn(),
  mockMatchesFindById: vi.fn(),
  mockPlayersFindByUserId: vi.fn(),
  mockEventsFindById: vi.fn(),
  mockRunInTransaction: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      matches: {
        findByIdWithDate: mockMatchesFindByIdWithDate,
        findById: mockMatchesFindById,
      },
    },
    leagueOps: {
      events: { findById: mockEventsFindById },
    },
    roster: {
      players: { findByUserId: mockPlayersFindByUserId },
    },
    runInTransaction: mockRunInTransaction,
  }),
}));

import { handler as claimSlot } from '../claimSlot';

// ---- Helpers ---------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

function ev(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/',
    pathParameters: { matchId: 'm1', slotId: 's1' },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: { groups: 'Wrestler', principalId: 'sub-1', username: 't', email: 't@t' },
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

describe('claimSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayersFindByUserId.mockResolvedValue({ playerId: 'p-caller' });
  });

  it('claims an open slot and stays open-signups when other slots remain', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch());
    const tx = captureTx();

    const r = await claimSlot(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.status).toBe('open-signups');
    expect(b.participants).toEqual(['p-caller']);
    expect(b.slots[0].playerId).toBe('p-caller');
    expect(b.slots[0].claimedAt).toBeDefined();
    expect(tx.updateMatch).toHaveBeenCalledWith(
      'm1',
      '2024-06-01T00:00:00Z',
      expect.objectContaining({ status: 'open-signups' }),
    );
    // Regression: DynamoUnitOfWork.updateMatch appends updatedAt itself, so
    // including it in the patch would set the same path twice and DynamoDB
    // rejects the UpdateExpression.
    const patch = (tx.updateMatch as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(patch).not.toHaveProperty('updatedAt');
  });

  it('flips status to scheduled when claiming the last open slot', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        slots: [
          { slotId: 's1', position: 1 },
          { slotId: 's2', position: 2, playerId: 'p-other', claimedAt: '2024-05-31T00:00:00Z' },
        ],
        participants: ['p-other'],
      }),
    );
    const tx = captureTx();

    const r = await claimSlot(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    const b = JSON.parse(r!.body);
    expect(b.status).toBe('scheduled');
    expect(b.participants).toEqual(['p-caller', 'p-other']);
    expect(tx.updateMatch).toHaveBeenCalledWith(
      'm1',
      expect.any(String),
      expect.objectContaining({ status: 'scheduled' }),
    );
  });

  it('idempotent re-claim by current occupant returns 200 without writing', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        slots: [
          { slotId: 's1', position: 1, playerId: 'p-caller', claimedAt: '2024-05-30T00:00:00Z' },
          { slotId: 's2', position: 2 },
        ],
        participants: ['p-caller'],
      }),
    );

    const r = await claimSlot(ev(), ctx, cb);

    expect(r!.statusCode).toBe(200);
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('returns 409 when the slot is locked by an admin', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        slots: [
          { slotId: 's1', position: 1, lockedByAdmin: true },
          { slotId: 's2', position: 2 },
        ],
      }),
    );

    const r = await claimSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(409);
    expect(JSON.parse(r!.body).message).toContain('locked');
  });

  it('returns 409 when the slot is already claimed by someone else', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        slots: [
          { slotId: 's1', position: 1, playerId: 'p-other', claimedAt: '2024-05-30T00:00:00Z' },
          { slotId: 's2', position: 2 },
        ],
        participants: ['p-other'],
      }),
    );

    const r = await claimSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(409);
    expect(JSON.parse(r!.body).message).toContain('already claimed');
  });

  it('returns 409 when match status is not open-signups', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({ status: 'scheduled' }),
    );

    const r = await claimSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(409);
    expect(JSON.parse(r!.body).message).toContain('not open');
  });

  it('returns 409 when caller already occupies another slot in this match', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        slots: [
          { slotId: 's1', position: 1 },
          { slotId: 's2', position: 2, playerId: 'p-caller', claimedAt: '2024-05-30T00:00:00Z' },
        ],
        participants: ['p-caller'],
      }),
    );

    const r = await claimSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(409);
    expect(JSON.parse(r!.body).message).toContain('another slot');
  });

  it('returns 404 when match is not found', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(null);
    const r = await claimSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(404);
  });

  it('returns 404 when slot is not found', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch());
    const r = await claimSlot(ev({ pathParameters: { matchId: 'm1', slotId: 'unknown' } }), ctx, cb);
    expect(r!.statusCode).toBe(404);
  });

  it('returns 403 when the caller has no linked player profile', async () => {
    mockPlayersFindByUserId.mockResolvedValue(null);
    mockMatchesFindByIdWithDate.mockResolvedValue(makeMatch());
    const r = await claimSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(403);
  });

  it('allows claim on an upcoming event even if its date is in the past', async () => {
    // Date-only ISO strings parse as midnight UTC; a same-day event would
    // be falsely blocked by a naive past-date check. We trust the
    // admin-controlled status instead — only completed/cancelled gates.
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({ eventId: 'e1' }),
    );
    mockEventsFindById.mockResolvedValue({
      eventId: 'e1',
      status: 'upcoming',
      date: '2000-01-01T00:00:00Z',
    });
    captureTx();

    const r = await claimSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(200);
  });

  it('returns 409 when linked event is completed', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({ eventId: 'e1' }),
    );
    mockEventsFindById.mockResolvedValue({
      eventId: 'e1',
      status: 'completed',
      date: '2999-01-01T00:00:00Z',
    });

    const r = await claimSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(409);
  });

  // ── MSL-04: one slot per event card ────────────────────────────────────

  it('rejects a claim when caller already occupies a slot on another match of the same event', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({ eventId: 'e1', matchId: 'm-target' }),
    );
    mockEventsFindById.mockResolvedValue({
      eventId: 'e1',
      status: 'upcoming',
      date: '2999-01-01T00:00:00Z',
      matchCards: [
        { matchId: 'm-target', position: 1, designation: 'midcard' },
        { matchId: 'm-other', position: 2, designation: 'midcard' },
      ],
    });
    mockMatchesFindById.mockImplementation(async (id: string) => {
      if (id === 'm-other') {
        return {
          matchId: 'm-other',
          slots: [
            { slotId: 'o1', position: 1, playerId: 'p-caller', claimedAt: '2024-05-30T00:00:00Z' },
            { slotId: 'o2', position: 2 },
          ],
        };
      }
      return null;
    });
    captureTx();

    const r = await claimSlot(
      ev({ pathParameters: { matchId: 'm-target', slotId: 's1' } }),
      ctx,
      cb,
    );
    expect(r!.statusCode).toBe(409);
    expect(JSON.parse(r!.body).message).toContain('another match');
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('allows a claim when caller occupies a slot on a different event', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({ eventId: 'e1' }),
    );
    mockEventsFindById.mockResolvedValue({
      eventId: 'e1',
      status: 'upcoming',
      date: '2999-01-01T00:00:00Z',
      matchCards: [
        // Only this match — no siblings on this event card.
        { matchId: 'm1', position: 1, designation: 'midcard' },
      ],
    });
    captureTx();

    const r = await claimSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(mockMatchesFindById).not.toHaveBeenCalled();
  });

  it('allows a claim when sibling matches have no slots (legacy match in same event)', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({ eventId: 'e1', matchId: 'm-target' }),
    );
    mockEventsFindById.mockResolvedValue({
      eventId: 'e1',
      status: 'upcoming',
      date: '2999-01-01T00:00:00Z',
      matchCards: [
        { matchId: 'm-target', position: 1, designation: 'midcard' },
        { matchId: 'm-legacy', position: 2, designation: 'midcard' },
      ],
    });
    mockMatchesFindById.mockResolvedValue({
      matchId: 'm-legacy',
      slots: undefined, // legacy non-slot match
    });
    captureTx();

    const r = await claimSlot(
      ev({ pathParameters: { matchId: 'm-target', slotId: 's1' } }),
      ctx,
      cb,
    );
    expect(r!.statusCode).toBe(200);
  });

  it('idempotent re-claim short-circuits before the cross-match check (no event load)', async () => {
    mockMatchesFindByIdWithDate.mockResolvedValue(
      makeMatch({
        eventId: 'e1',
        slots: [
          { slotId: 's1', position: 1, playerId: 'p-caller', claimedAt: '2024-05-30T00:00:00Z' },
          { slotId: 's2', position: 2 },
        ],
        participants: ['p-caller'],
      }),
    );

    const r = await claimSlot(ev(), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(mockEventsFindById).not.toHaveBeenCalled();
    expect(mockMatchesFindById).not.toHaveBeenCalled();
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });
});
