import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from '../../__tests__/testHelpers';

const mockRivalries = { get: vi.fn() };
const mockNotes = { create: vi.fn(), update: vi.fn(), listByRivalry: vi.fn() };
const mockMatches = { findById: vi.fn() };
const mockEvents = { findById: vi.fn() };
const mockPlayers = { findByUserId: vi.fn() };

vi.mock('../../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    rivalryNotes: mockNotes,
    competition: { matches: mockMatches },
    leagueOps: { events: mockEvents },
    roster: { players: mockPlayers },
  }),
}));

import { handler as upsertNote } from '../upsertNote';

const rivalry = {
  rivalryId: 'r1',
  title: 'feud',
  status: 'active',
  heat: 'warm',
  requestedBy: 'p1',
  participants: [
    { playerId: 'p1', role: 'instigator', addedAt: '' },
    { playerId: 'p2', role: 'rival', addedAt: '' },
  ],
  createdAt: '',
  updatedAt: '',
};

function postEvent(body: Record<string, unknown>) {
  return makeEvent({
    httpMethod: 'POST',
    pathParameters: { rivalryId: 'r1' },
    body: JSON.stringify(body),
  });
}

const gmPlanNote = {
  noteId: 'note-1',
  rivalryId: 'r1',
  noteType: 'plan',
  visibility: 'admins',
  body: 'secret plan',
  authorPlayerId: 'gm',
  createdAt: '',
  updatedAt: '',
};

const storylineNoteByP1 = {
  ...gmPlanNote,
  noteId: 'note-2',
  noteType: 'storyline',
  visibility: 'participants',
  body: 'my promo idea',
  authorPlayerId: 'p1',
};

describe('upsertNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotes.listByRivalry.mockResolvedValue([gmPlanNote, storylineNoteByP1]);
    mockRivalries.get.mockResolvedValue(rivalry);
    mockPlayers.findByUserId.mockResolvedValue(null);
    mockMatches.findById.mockResolvedValue({ matchId: 'm1' });
    mockEvents.findById.mockResolvedValue({ eventId: 'e1' });
    mockNotes.create.mockImplementation(async (input: Record<string, unknown>) => ({
      ...input,
      noteId: 'note-1',
      createdAt: '',
      updatedAt: '',
    }));
    mockNotes.update.mockImplementation(async (
      _rivalryId: string,
      noteId: string,
      patch: Record<string, unknown>,
    ) => ({
      noteId,
      rivalryId: 'r1',
      noteType: 'plan',
      visibility: 'admins',
      body: 'updated',
      authorPlayerId: 'gm',
      createdAt: '',
      updatedAt: '',
      ...patch,
    }));
  });

  it('lets a GM create a plan note linked to a match', async () => {
    const res = await upsertNote(
      withAuth(
        postEvent({
          noteType: 'plan',
          content: 'beat 3: turn heel',
          linkedMatchId: 'm1',
          scheduledFor: '2026-06-01T00:00:00.000Z',
        }),
        'Admin',
        'gm-sub',
      ),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(200);
    expect(mockNotes.create).toHaveBeenCalledTimes(1);
    const created = mockNotes.create.mock.calls[0][0];
    expect(created.noteType).toBe('plan');
    // Default visibility for GM-created notes is now 'participants'
    // (scope is rivalry participants + GMs; no UI surface creates
    // admins-only notes via the dropdown anymore).
    expect(created.visibility).toBe('participants');
    expect(created.linkedMatchId).toBe('m1');
    expect(created.scheduledFor).toBe('2026-06-01T00:00:00.000Z');
  });

  it('rejects a wrestler trying to author a plan note with 403', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });

    const res = await upsertNote(
      withAuth(postEvent({ noteType: 'plan', content: 'spoiler' }), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(403);
    expect(mockNotes.create).not.toHaveBeenCalled();
  });

  it('forces a wrestler-authored storyline note to participants visibility', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });

    const res = await upsertNote(
      withAuth(
        postEvent({
          noteType: 'storyline',
          content: 'visible to my opponent + the GMs',
          visibility: 'all', // attempting to make it fully public — must be coerced
        }),
        'Wrestler',
        'user-p1',
      ),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(200);
    expect(mockNotes.create).toHaveBeenCalledTimes(1);
    const created = mockNotes.create.mock.calls[0][0];
    expect(created.visibility).toBe('participants');
    expect(created.authorPlayerId).toBe('p1');
  });

  it('returns 400 when linkedMatchId does not resolve', async () => {
    mockMatches.findById.mockResolvedValueOnce(null);

    const res = await upsertNote(
      withAuth(
        postEvent({ noteType: 'plan', content: 'x', linkedMatchId: 'ghost' }),
        'Admin',
        'gm-sub',
      ),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(400);
    expect(mockNotes.create).not.toHaveBeenCalled();
  });

  it('rejects a non-participant non-GM with 403', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p99', userId: 'user-other' });

    const res = await upsertNote(
      withAuth(
        postEvent({ noteType: 'storyline', content: 'hi' }),
        'Wrestler',
        'user-other',
      ),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(403);
    expect(mockNotes.create).not.toHaveBeenCalled();
  });

  it('updates an existing note when noteId is provided', async () => {
    const res = await upsertNote(
      withAuth(
        postEvent({
          noteId: 'note-1',
          noteType: 'plan',
          content: 'updated body',
          visibility: 'participants',
        }),
        'Admin',
        'gm-sub',
      ),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(200);
    expect(mockNotes.update).toHaveBeenCalledTimes(1);
    expect(mockNotes.update).toHaveBeenCalledWith('r1', 'note-1', expect.objectContaining({
      body: 'updated body',
      visibility: 'participants',
    }));
    expect(mockNotes.create).not.toHaveBeenCalled();
  });

  describe('editing an existing note', () => {
    const asWrestler = (body: Record<string, unknown>, sub: string) =>
      withAuth(postEvent(body), 'Wrestler', sub);

    it("refuses a participant editing another participant's note", async () => {
      mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p2', userId: 'user-p2' });

      const res = await upsertNote(
        asWrestler({ noteId: 'note-2', noteType: 'storyline', content: 'forged' }, 'user-p2'),
        ctx,
        cb,
      );

      expect(res!.statusCode).toBe(403);
      expect(mockNotes.update).not.toHaveBeenCalled();
    });

    it("refuses a participant editing a GM plan by claiming it is a storyline note", async () => {
      mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p2', userId: 'user-p2' });

      const res = await upsertNote(
        asWrestler({ noteId: 'note-1', noteType: 'storyline', content: 'HIJACK' }, 'user-p2'),
        ctx,
        cb,
      );

      expect(res!.statusCode).toBe(403);
      expect(mockNotes.update).not.toHaveBeenCalled();
    });

    it('lets the author edit their own note', async () => {
      mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });

      const res = await upsertNote(
        asWrestler({ noteId: 'note-2', noteType: 'storyline', content: 'better idea' }, 'user-p1'),
        ctx,
        cb,
      );

      expect(res!.statusCode).toBe(200);
      expect(mockNotes.update).toHaveBeenCalledWith('r1', 'note-2', expect.objectContaining({
        body: 'better idea',
      }));
    });

    it('keeps a stored visibility the author cannot set', async () => {
      mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });
      mockNotes.listByRivalry.mockResolvedValue([{ ...storylineNoteByP1, visibility: 'admins' }]);

      await upsertNote(
        asWrestler(
          { noteId: 'note-2', noteType: 'storyline', content: 'edit', visibility: 'all' },
          'user-p1',
        ),
        ctx,
        cb,
      );

      expect(mockNotes.update.mock.calls[0][2].visibility).toBe('admins');
    });

    it("lets a GM edit someone else's note", async () => {
      const res = await upsertNote(
        withAuth(
          postEvent({ noteId: 'note-2', noteType: 'storyline', content: 'tidied up' }),
          'Moderator',
          'gm-sub',
        ),
        ctx,
        cb,
      );

      expect(res!.statusCode).toBe(200);
      expect(mockNotes.update).toHaveBeenCalledTimes(1);
    });

    it('does not widen an admins-only note when a GM omits visibility', async () => {
      await upsertNote(
        withAuth(
          postEvent({ noteId: 'note-1', noteType: 'plan', content: 'still secret' }),
          'Admin',
          'gm-sub',
        ),
        ctx,
        cb,
      );

      expect(mockNotes.update.mock.calls[0][2].visibility).toBe('admins');
    });

    it('returns 404 for an unknown noteId', async () => {
      const res = await upsertNote(
        withAuth(
          postEvent({ noteId: 'ghost', noteType: 'plan', content: 'x' }),
          'Admin',
          'gm-sub',
        ),
        ctx,
        cb,
      );

      expect(res!.statusCode).toBe(404);
      expect(mockNotes.update).not.toHaveBeenCalled();
    });
  });
});
