import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from './testHelpers';

const mockRivalries = { get: vi.fn() };
const mockMessages = { list: vi.fn() };
const mockNotes = { listByRivalry: vi.fn() };
const mockMatches = { list: vi.fn() };
const mockPromos = { listByPlayer: vi.fn() };
const mockEvents = { listByStatus: vi.fn() };
const mockPlayers = { findByUserId: vi.fn() };

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    rivalries: mockRivalries,
    rivalryMessages: mockMessages,
    rivalryNotes: mockNotes,
    competition: { matches: mockMatches },
    content: { promos: mockPromos },
    leagueOps: { events: mockEvents },
    roster: { players: mockPlayers },
  }),
}));

// Optional auth — never called by these tests because we don't set an
// Authorization header. The mock keeps the import resolvable.
vi.mock('../../../lib/authenticate', () => ({
  authenticate: vi.fn().mockResolvedValue({ ok: false }),
}));

import { handler as getRivalry } from '../getRivalry';

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
  moderationNote: 'private booker note',
};

describe('getRivalry (hydrated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRivalries.get.mockResolvedValue(rivalry);
    mockMessages.list.mockResolvedValue({ items: [], nextCursor: undefined });
    mockNotes.listByRivalry.mockResolvedValue([]);
    mockMatches.list.mockResolvedValue([]);
    mockPromos.listByPlayer.mockResolvedValue([]);
    mockEvents.listByStatus.mockResolvedValue([]);
    mockPlayers.findByUserId.mockResolvedValue(null);
  });

  it('returns 404 when the rivalry is missing', async () => {
    mockRivalries.get.mockResolvedValueOnce(undefined);
    const res = await getRivalry(
      makeEvent({ httpMethod: 'GET', pathParameters: { rivalryId: 'r1' } }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(404);
  });

  it('returns a public-safe payload without moderationNote for anonymous callers', async () => {
    const res = await getRivalry(
      makeEvent({ httpMethod: 'GET', pathParameters: { rivalryId: 'r1' } }),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(200);
    const body = JSON.parse(res!.body);
    expect(body.rivalry.moderationNote).toBeUndefined();
    expect(body.recentMessages).toEqual([]);
    expect(body.notes).toEqual([]);
  });

  it('filters notes by visibility for anonymous callers', async () => {
    mockNotes.listByRivalry.mockResolvedValue([
      { rivalryId: 'r1', noteId: 'n1', noteType: 'storyline', visibility: 'all', body: 'public', authorPlayerId: 'admin', createdAt: '', updatedAt: '' },
      { rivalryId: 'r1', noteId: 'n2', noteType: 'plan', visibility: 'admins', body: 'secret', authorPlayerId: 'admin', createdAt: '', updatedAt: '' },
      { rivalryId: 'r1', noteId: 'n3', noteType: 'storyline', visibility: 'participants', body: 'partial', authorPlayerId: 'admin', createdAt: '', updatedAt: '' },
    ]);
    const res = await getRivalry(
      makeEvent({ httpMethod: 'GET', pathParameters: { rivalryId: 'r1' } }),
      ctx,
      cb,
    );
    const body = JSON.parse(res!.body);
    expect(body.notes.map((n: { noteId: string }) => n.noteId)).toEqual(['n1']);
  });

  it('computes head-to-head wins from completed matches', async () => {
    mockMatches.list.mockResolvedValue([
      { matchId: 'm1', date: '2026-04-01', status: 'completed', participants: ['p1', 'p2'], winners: ['p1'] },
      { matchId: 'm2', date: '2026-04-15', status: 'completed', participants: ['p1', 'p2'], winners: ['p2'] },
      { matchId: 'm3', date: '2026-04-20', status: 'completed', participants: ['p1', 'p2'], winners: ['p1'], isChampionship: true },
      { matchId: 'm4', date: '2026-04-21', status: 'scheduled', participants: ['p1', 'p2'] },
    ]);
    const res = await getRivalry(
      makeEvent({ httpMethod: 'GET', pathParameters: { rivalryId: 'r1' } }),
      ctx,
      cb,
    );
    const body = JSON.parse(res!.body);
    expect(body.headToHead.totalMatches).toBe(3);
    expect(body.headToHead.championshipMatches).toBe(1);
    expect(body.headToHead.winsByParticipant).toEqual({ p1: 2, p2: 1 });
    expect(body.headToHead.recentMatchIds[0]).toBe('m3');
  });

  it('picks the next upcoming event with a scheduled match between the participants', async () => {
    mockMatches.list.mockResolvedValue([
      { matchId: 'mA', date: '2026-06-01', status: 'scheduled', participants: ['p1', 'p2'], eventId: 'eY' },
      { matchId: 'mB', date: '2026-06-15', status: 'scheduled', participants: ['p1', 'p2'], eventId: 'eZ' },
    ]);
    mockEvents.listByStatus.mockResolvedValue([
      { eventId: 'eX', name: 'Other', date: '2026-05-20', eventType: 'show', status: 'upcoming' },
      { eventId: 'eY', name: 'Feud Climax', date: '2026-06-02', eventType: 'ppv', status: 'upcoming' },
      { eventId: 'eZ', name: 'Sequel', date: '2026-06-16', eventType: 'show', status: 'upcoming' },
    ]);
    const res = await getRivalry(
      makeEvent({ httpMethod: 'GET', pathParameters: { rivalryId: 'r1' } }),
      ctx,
      cb,
    );
    const body = JSON.parse(res!.body);
    expect(body.nextEvent.eventId).toBe('eY');
  });
});
