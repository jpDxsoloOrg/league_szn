import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from '../../__tests__/testHelpers';

const mockRivalries = { get: vi.fn() };
const mockNotes = { listByRivalry: vi.fn(), delete: vi.fn() };
const mockPlayers = { findByUserId: vi.fn() };

vi.mock('../../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    rivalryNotes: mockNotes,
    roster: { players: mockPlayers },
  }),
}));

import { handler as deleteNote } from '../deleteNote';

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

const sampleNote = {
  rivalryId: 'r1',
  noteId: 'note-1',
  noteType: 'storyline' as const,
  visibility: 'participants' as const,
  body: 'hi',
  authorPlayerId: 'p1',
  createdAt: '',
  updatedAt: '',
};

function delEvent() {
  return makeEvent({
    httpMethod: 'DELETE',
    pathParameters: { rivalryId: 'r1', noteId: 'note-1' },
  });
}

describe('deleteNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRivalries.get.mockResolvedValue(rivalry);
    mockNotes.listByRivalry.mockResolvedValue([sampleNote]);
    mockNotes.delete.mockResolvedValue(undefined);
  });

  it('lets the note author delete their own note', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });

    const res = await deleteNote(
      withAuth(delEvent(), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(200);
    expect(mockNotes.delete).toHaveBeenCalledWith('r1', 'note-1');
  });

  it('lets a GM delete any note', async () => {
    mockPlayers.findByUserId.mockResolvedValue(null);

    const res = await deleteNote(
      withAuth(delEvent(), 'Admin', 'gm-sub'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(200);
    expect(mockNotes.delete).toHaveBeenCalledWith('r1', 'note-1');
  });

  it('rejects a participant trying to delete someone else\'s note', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p2', userId: 'user-p2' });

    const res = await deleteNote(
      withAuth(delEvent(), 'Wrestler', 'user-p2'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(403);
    expect(mockNotes.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when the note does not exist', async () => {
    mockNotes.listByRivalry.mockResolvedValueOnce([]);
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });

    const res = await deleteNote(
      withAuth(delEvent(), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(404);
  });
});
