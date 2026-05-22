import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from '../../__tests__/testHelpers';

const mockRivalries = { get: vi.fn() };
const mockNotes = { listByRivalry: vi.fn() };
const mockPlayers = { findByUserId: vi.fn() };

vi.mock('../../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    rivalryNotes: mockNotes,
    roster: { players: mockPlayers },
  }),
}));

import { handler as listNotes } from '../listNotes';

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

interface NoteFixture {
  noteId: string;
  noteType: 'storyline' | 'plan';
  visibility: 'all' | 'participants' | 'admins';
  authorPlayerId: string;
}

function noteFixture(over: NoteFixture) {
  return {
    rivalryId: 'r1',
    body: '',
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function listEvent(query: Record<string, string> = {}) {
  return makeEvent({
    httpMethod: 'GET',
    pathParameters: { rivalryId: 'r1' },
    queryStringParameters: query,
  });
}

describe('listNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRivalries.get.mockResolvedValue(rivalry);
    mockPlayers.findByUserId.mockResolvedValue(null);
  });

  it('returns 403 for non-participant non-GM', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p99', userId: 'user-other' });

    const res = await listNotes(
      withAuth(listEvent(), 'Wrestler', 'user-other'),
      ctx,
      cb,
    );

    expect(res!.statusCode).toBe(403);
  });

  it('hides admins-only notes authored by another wrestler', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });
    mockNotes.listByRivalry.mockResolvedValue([
      noteFixture({ noteId: 'n-other-admins', noteType: 'storyline', visibility: 'admins', authorPlayerId: 'p2' }),
      noteFixture({ noteId: 'n-public', noteType: 'storyline', visibility: 'all', authorPlayerId: 'p2' }),
    ]);

    const res = await listNotes(
      withAuth(listEvent(), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    const body = JSON.parse(res!.body);
    const ids = body.notes.map((n: { noteId: string }) => n.noteId);
    expect(ids).toContain('n-public');
    expect(ids).not.toContain('n-other-admins');
  });

  it('lets a wrestler see their own admins-only suggestion', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });
    mockNotes.listByRivalry.mockResolvedValue([
      noteFixture({ noteId: 'n-self', noteType: 'storyline', visibility: 'admins', authorPlayerId: 'p1' }),
    ]);

    const res = await listNotes(
      withAuth(listEvent(), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    const body = JSON.parse(res!.body);
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].noteId).toBe('n-self');
  });

  it('hides plan notes from wrestlers unless published to participants or all', async () => {
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', userId: 'user-p1' });
    mockNotes.listByRivalry.mockResolvedValue([
      noteFixture({ noteId: 'plan-admins', noteType: 'plan', visibility: 'admins', authorPlayerId: 'gm' }),
      noteFixture({ noteId: 'plan-participants', noteType: 'plan', visibility: 'participants', authorPlayerId: 'gm' }),
      noteFixture({ noteId: 'plan-all', noteType: 'plan', visibility: 'all', authorPlayerId: 'gm' }),
    ]);

    const res = await listNotes(
      withAuth(listEvent(), 'Wrestler', 'user-p1'),
      ctx,
      cb,
    );

    const body = JSON.parse(res!.body);
    const ids = body.notes.map((n: { noteId: string }) => n.noteId);
    expect(ids).toContain('plan-participants');
    expect(ids).toContain('plan-all');
    expect(ids).not.toContain('plan-admins');
  });

  it('returns every note to a GM regardless of visibility', async () => {
    mockNotes.listByRivalry.mockResolvedValue([
      noteFixture({ noteId: 'a', noteType: 'plan', visibility: 'admins', authorPlayerId: 'gm' }),
      noteFixture({ noteId: 'b', noteType: 'storyline', visibility: 'admins', authorPlayerId: 'p2' }),
      noteFixture({ noteId: 'c', noteType: 'storyline', visibility: 'all', authorPlayerId: 'p1' }),
    ]);

    const res = await listNotes(
      withAuth(listEvent(), 'Admin', 'gm-sub'),
      ctx,
      cb,
    );

    const body = JSON.parse(res!.body);
    expect(body.notes).toHaveLength(3);
  });

  it('applies noteType filter', async () => {
    mockNotes.listByRivalry.mockResolvedValue([
      noteFixture({ noteId: 'a', noteType: 'plan', visibility: 'all', authorPlayerId: 'gm' }),
      noteFixture({ noteId: 'b', noteType: 'storyline', visibility: 'all', authorPlayerId: 'p1' }),
    ]);

    const res = await listNotes(
      withAuth(listEvent({ noteType: 'plan' }), 'Admin', 'gm-sub'),
      ctx,
      cb,
    );

    const body = JSON.parse(res!.body);
    expect(body.notes.map((n: { noteId: string }) => n.noteId)).toEqual(['a']);
  });
});
