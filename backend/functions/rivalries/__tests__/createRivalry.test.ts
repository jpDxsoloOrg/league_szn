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

function gmEvent(body: object, role: string = 'Admin') {
  return withAuth(
    makeEvent({ body: JSON.stringify(body), httpMethod: 'POST' }),
    role,
    'gm-sub',
    'gm-jane',
  );
}

describe('createRivalry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayers.findByUserId.mockResolvedValue(null);
    mockPlayers.findById.mockImplementation(async (id: string) =>
      ({ playerId: id, name: id.toUpperCase() }),
    );
    mockRivalries.listByParticipant.mockResolvedValue({ items: [] });
    // The update mock should preserve participants from whatever the
    // last create() returned, so the auto-flip step doesn't strip them.
    let lastCreated: Record<string, unknown> | null = null;
    mockRivalries.create.mockImplementation(async (input: Record<string, unknown>) => {
      const result = {
        rivalryId: 'r1',
        ...input,
        status: 'pending',
        participants: (input.participants as Array<{ playerId: string; role?: string }>).map(
          (p) => ({
            playerId: p.playerId,
            role: p.role ?? 'rival',
            addedAt: '2026-05-11T00:00:00.000Z',
          }),
        ),
        createdAt: '2026-05-11T00:00:00.000Z',
        updatedAt: '2026-05-11T00:00:00.000Z',
      };
      lastCreated = result;
      return result;
    });
    mockRivalries.update.mockImplementation(async (_id, patch: Record<string, unknown>) => ({
      ...(lastCreated ?? {}),
      ...patch,
    }));
  });

  it('returns 403 when caller is not a GM', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ title: 't' }) }),
      'Wrestler',
    );
    const res = await createRivalry(event, ctx, cb);
    expect(res!.statusCode).toBe(403);
  });

  it('lets a GM create a rivalry between two wrestlers and auto-flips it to active', async () => {
    const res = await createRivalry(
      gmEvent({
        title: 'Bloodline Civil War',
        participants: [{ playerId: 'p2' }, { playerId: 'p3' }],
      }),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(201);
    const body = JSON.parse(res!.body);
    expect(body.status).toBe('active');
    // First participant becomes instigator by default.
    expect(body.participants[0].role).toBe('instigator');
    expect(body.participants[1].role).toBe('rival');
    expect(mockRivalries.update).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({
        status: 'active',
        bookerName: 'gm-jane',
      }),
    );
  });

  it('allows a Moderator to create too', async () => {
    const res = await createRivalry(
      gmEvent(
        {
          title: 'Mod-driven feud',
          participants: [{ playerId: 'p2' }, { playerId: 'p3' }],
        },
        'Moderator',
      ),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(201);
  });

  it('rejects when fewer than two participants are provided', async () => {
    const res = await createRivalry(
      gmEvent({ title: 't', participants: [{ playerId: 'p1' }] }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(400);
    expect(JSON.parse(res!.body).message).toMatch(/two participants/i);
  });

  it('rejects duplicate participant ids', async () => {
    const res = await createRivalry(
      gmEvent({ title: 't', participants: [{ playerId: 'p1' }, { playerId: 'p1' }] }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(400);
    expect(JSON.parse(res!.body).message).toMatch(/duplicate/i);
  });

  it('allows the GM to pick two wrestlers neither of whom is themselves', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'gm-player', userId: 'gm-sub' });
    const res = await createRivalry(
      gmEvent({
        title: 'External booking',
        participants: [{ playerId: 'p2' }, { playerId: 'p3' }],
      }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(201);
    // requestedBy falls back to the first participant when the GM has a
    // linked player but isn't one of the two wrestlers.
    expect(mockRivalries.create).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: 'gm-player' }),
    );
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
      gmEvent({
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
      gmEvent({
        title: 'sequel',
        participants: [{ playerId: 'p1' }, { playerId: 'p2' }],
      }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(201);
  });
});
