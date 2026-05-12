import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from './testHelpers';

const mockRivalries = {
  get: vi.fn(),
  listByParticipant: vi.fn(),
  listByStatus: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  addParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  delete: vi.fn(),
};

const mockPlayers = {
  findById: vi.fn(),
  findByUserId: vi.fn(),
  list: vi.fn(),
};

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    roster: { players: mockPlayers },
  }),
}));

import { handler as createRivalry } from '../createRivalry';

function wrestlerEvent(body: object) {
  return withAuth(
    makeEvent({ body: JSON.stringify(body), httpMethod: 'POST' }),
    'Wrestler',
    'user-1',
  );
}

describe('createRivalry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-1', name: 'A' });
    mockPlayers.findById.mockImplementation(async (id: string) =>
      ({ playerId: id, name: id.toUpperCase() }),
    );
    mockRivalries.listByParticipant.mockResolvedValue({ items: [] });
    mockRivalries.create.mockImplementation(async (input) => ({
      rivalryId: 'r1',
      ...input,
      status: 'pending',
      participants: input.participants.map((p: { playerId: string; role?: string }) => ({
        playerId: p.playerId,
        role: p.role ?? 'rival',
        addedAt: '2026-05-11T00:00:00.000Z',
      })),
      createdAt: '2026-05-11T00:00:00.000Z',
      updatedAt: '2026-05-11T00:00:00.000Z',
    }));
  });

  it('returns 403 when caller is not a Wrestler', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({ title: 't' }) }), 'Fantasy');
    const res = await createRivalry(event, ctx, cb);
    expect(res!.statusCode).toBe(403);
  });

  it('creates a rivalry with status=pending and returns 201', async () => {
    const res = await createRivalry(
      wrestlerEvent({
        title: 'Cage match summer',
        participants: [{ playerId: 'p1' }, { playerId: 'p2' }],
      }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(201);
    const body = JSON.parse(res!.body);
    expect(body.status).toBe('pending');
    expect(body.participants).toHaveLength(2);
    // Requester defaults to instigator when no explicit role passed.
    const requester = body.participants.find((p: { playerId: string }) => p.playerId === 'p1');
    expect(requester.role).toBe('instigator');
  });

  it('rejects when fewer than two participants are provided', async () => {
    const res = await createRivalry(
      wrestlerEvent({ title: 't', participants: [{ playerId: 'p1' }] }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(400);
    expect(JSON.parse(res!.body).message).toMatch(/two participants/i);
  });

  it('rejects duplicate participant ids', async () => {
    const res = await createRivalry(
      wrestlerEvent({ title: 't', participants: [{ playerId: 'p1' }, { playerId: 'p1' }] }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(400);
    expect(JSON.parse(res!.body).message).toMatch(/duplicate/i);
  });

  it('rejects when requester is not in the participant list', async () => {
    const res = await createRivalry(
      wrestlerEvent({ title: 't', participants: [{ playerId: 'p2' }, { playerId: 'p3' }] }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(400);
    expect(JSON.parse(res!.body).message).toMatch(/requester must be/i);
  });

  it('returns 409 when an active rivalry with the same participants exists', async () => {
    mockRivalries.listByParticipant.mockResolvedValue({
      items: [
        {
          rivalryId: 'existing-1',
          status: 'active',
          participants: [
            { playerId: 'p1', role: 'instigator', addedAt: '' },
            { playerId: 'p2', role: 'rival', addedAt: '' },
          ],
        },
      ],
    });
    const res = await createRivalry(
      wrestlerEvent({
        title: 'rematch',
        participants: [{ playerId: 'p1' }, { playerId: 'p2' }],
      }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(409);
    expect(mockRivalries.create).not.toHaveBeenCalled();
  });

  it('allows a fresh rivalry if the previous one is completed', async () => {
    mockRivalries.listByParticipant.mockResolvedValue({
      items: [
        {
          rivalryId: 'old-1',
          status: 'completed',
          participants: [
            { playerId: 'p1', role: 'instigator', addedAt: '' },
            { playerId: 'p2', role: 'rival', addedAt: '' },
          ],
        },
      ],
    });
    const res = await createRivalry(
      wrestlerEvent({
        title: 'sequel',
        participants: [{ playerId: 'p1' }, { playerId: 'p2' }],
      }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(201);
  });
});
