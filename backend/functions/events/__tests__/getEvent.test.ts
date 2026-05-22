import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';

import { handler as getEvent } from '../getEvent';

// ─── Helpers ─────────────────────────────────────────────────────────

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

// ─── Tests ───────────────────────────────────────────────────────────

describe('getEvent', () => {
  it('returns 400 when eventId path parameter is missing', async () => {
    const result = await getEvent(makeEvent({ pathParameters: null }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Event ID is required');
  });

  it('returns 404 when event does not exist', async () => {
    const event = makeEvent({ pathParameters: { eventId: 'nonexistent' } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Event not found');
  });

  it('returns event with empty enrichedMatches when no matchCards', async () => {
    await repos.leagueOps.events.create({
      name: 'WrestleMania', eventType: 'ppv', date: '2024-01-01',
    });
    const events = await repos.leagueOps.events.list();
    const eventItem = events[0];
    // Set matchCards to empty array
    await repos.leagueOps.events.update(eventItem.eventId, { matchCards: [] });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.eventId).toBe(eventItem.eventId);
    expect(body.enrichedMatches).toEqual([]);
  });

  it('returns enriched match data with player names and championship info', async () => {
    // Create player
    const player = await repos.roster.players.create({
      name: 'John Cena', currentWrestler: 'John Cena',
    });

    // Create championship
    const championship = await repos.competition.championships.create({
      name: 'World Championship', type: 'singles',
    });

    // Create match
    const match = await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01', matchFormat: 'singles', stipulation: 'No DQ',
      participants: [player.playerId], winners: [player.playerId], losers: [],
      isChampionship: true, championshipId: championship.championshipId,
      status: 'completed', createdAt: new Date().toISOString(),
    });

    // Create event with matchCards
    const eventItem = await repos.leagueOps.events.create({
      name: 'WrestleMania', eventType: 'ppv', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [{ position: 1, matchId: match.matchId, designation: 'main-event' as const, notes: 'Title match' }],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });
    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.enrichedMatches).toHaveLength(1);
    const enrichedMatch = body.enrichedMatches[0];
    expect(enrichedMatch.position).toBe(1);
    expect(enrichedMatch.designation).toBe('main-event');
    expect(enrichedMatch.notes).toBe('Title match');
    expect(enrichedMatch.matchData.matchFormat).toBe('singles');
    expect(enrichedMatch.matchData.participants).toHaveLength(1);
    expect(enrichedMatch.matchData.participants[0].playerName).toBe('John Cena');
    expect(enrichedMatch.matchData.participants[0].wrestlerName).toBe('John Cena');
    expect(enrichedMatch.matchData.isChampionship).toBe(true);
    expect(enrichedMatch.matchData.championshipName).toBe('World Championship');
  });

  it('returns matchData null when matchId is missing from card', async () => {
    const eventItem = await repos.leagueOps.events.create({
      name: 'Raw', eventType: 'weekly', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [{ position: 1, matchId: undefined as unknown as string, designation: 'pre-show' as const }],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).enrichedMatches[0].matchData).toBeNull();
  });

  it('returns matchData null when match is not found in database', async () => {
    const eventItem = await repos.leagueOps.events.create({
      name: 'Raw', eventType: 'weekly', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [{ position: 1, matchId: 'm-gone', designation: 'opener' as const }],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.enrichedMatches[0].matchData).toBeNull();
    expect(body.enrichedMatches[0].matchId).toBe('m-gone');
  });

  it('uses Unknown Player/Wrestler when player not found', async () => {
    // Create a match with a non-existent player
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01', matchFormat: 'singles',
      participants: ['p-missing'], isChampionship: false, status: 'scheduled',
      createdAt: new Date().toISOString(),
    });

    const eventItem = await repos.leagueOps.events.create({
      name: 'Raw', eventType: 'weekly', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [{ position: 1, matchId: 'm1', designation: 'midcard' as const }],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const participant = JSON.parse(result!.body).enrichedMatches[0].matchData.participants[0];
    expect(participant.playerName).toBe('Unknown Player');
    expect(participant.wrestlerName).toBe('Unknown Wrestler');
  });

  it('omits championshipName when match is not a championship match', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01', matchFormat: 'tag',
      participants: [], isChampionship: false, status: 'scheduled',
      createdAt: new Date().toISOString(),
    });

    const eventItem = await repos.leagueOps.events.create({
      name: 'Raw', eventType: 'weekly', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [{ position: 1, matchId: 'm1', designation: 'midcard' as const }],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const matchData = JSON.parse(result!.body).enrichedMatches[0].matchData;
    expect(matchData.isChampionship).toBe(false);
    expect(matchData.championshipName).toBeUndefined();
  });

  it('handles event with undefined matchCards property', async () => {
    const eventItem = await repos.leagueOps.events.create({
      name: 'Raw', eventType: 'weekly', date: '2024-01-01',
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.enrichedMatches).toEqual([]);
  });

  it('returns 500 when repository fails', async () => {
    vi.spyOn(repos.leagueOps.events, 'findById').mockRejectedValue(new Error('DB error'));
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    // The handler now appends the underlying error detail so the user (and
    // their server log) can see what actually broke instead of a generic
    // "Failed to fetch event" with no clue.
    expect(JSON.parse(result!.body).message).toMatch(/^Failed to fetch event/);
    expect(JSON.parse(result!.body).message).toContain('DB error');
  });

  it('participants[].wrestlerName uses slot wrestlerNameSnapshot when present (MSL-03)', async () => {
    // Regression: a player who claimed a slot with their alternate must show
    // up as that alternate name in BOTH the slot row and the match-card
    // header (which reads from participants[].wrestlerName). Previously the
    // header always rendered the player's currentWrestler regardless.
    const player = await repos.roster.players.create({
      name: 'JPAdmin',
      currentWrestler: 'Raquel Rodriguez',
      alternateWrestler: 'Diamond Dallas Page',
    });

    const match = await repos.competition.matches.create({
      matchId: 'm-snap',
      date: '2024-01-01',
      matchFormat: 'singles',
      participants: [player.playerId],
      slots: [
        {
          slotId: 's1',
          position: 1,
          playerId: player.playerId,
          claimedAt: '2024-01-01T00:00:00Z',
          wrestlerChoice: 'alternate',
          wrestlerNameSnapshot: 'Diamond Dallas Page',
        },
      ],
      slotsRequired: 2,
      isChampionship: false,
      status: 'open-signups',
      createdAt: new Date().toISOString(),
    });

    const eventItem = await repos.leagueOps.events.create({
      name: 'Raw', eventType: 'weekly', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [
        { position: 1, matchId: match.matchId, designation: 'midcard' as const },
      ],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });
    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    const md = body.enrichedMatches[0].matchData;
    // The header / participants list shows the alternate, not the live main.
    expect(md.participants[0].wrestlerName).toBe('Diamond Dallas Page');
    // Slot row also shows the alternate (existing MSL-03 hydration).
    expect(md.slots[0].wrestlerName).toBe('Diamond Dallas Page');
  });

  it('participants[].wrestlerName falls back to currentWrestler when no snapshot is set', async () => {
    // Legacy path: a slot claimed before MSL-03 has no wrestlerNameSnapshot.
    // The header should fall back to the player's currentWrestler.
    const player = await repos.roster.players.create({
      name: 'JPAdmin',
      currentWrestler: 'Stone Cold',
    });
    const match = await repos.competition.matches.create({
      matchId: 'm-legacy',
      date: '2024-01-01',
      matchFormat: 'singles',
      participants: [player.playerId],
      slots: [
        { slotId: 's1', position: 1, playerId: player.playerId },
      ],
      slotsRequired: 2,
      isChampionship: false,
      status: 'open-signups',
      createdAt: new Date().toISOString(),
    });
    const eventItem = await repos.leagueOps.events.create({
      name: 'Raw', eventType: 'weekly', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [{ position: 1, matchId: match.matchId, designation: 'midcard' as const }],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });
    const result = await getEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.enrichedMatches[0].matchData.participants[0].wrestlerName).toBe('Stone Cold');
  });

  // RIV-24: every matchData carries userHasRated + userRating.
  describe('RIV-24 user rating decoration', () => {
    async function setupEventWithFiveMatches(): Promise<{ eventId: string }> {
      const matchIds = ['m1', 'm2', 'm3', 'm4', 'm5'];
      for (const matchId of matchIds) {
        await repos.competition.matches.create({
          matchId,
          date: '2024-01-01',
          matchFormat: 'singles',
          participants: [],
          isChampionship: false,
          status: 'completed',
          createdAt: new Date().toISOString(),
        });
      }
      const eventItem = await repos.leagueOps.events.create({
        name: 'Raw', eventType: 'weekly', date: '2024-01-01',
      });
      await repos.leagueOps.events.update(eventItem.eventId, {
        matchCards: matchIds.map((matchId, i) => ({
          position: i + 1, matchId, designation: 'midcard' as const,
        })),
      });
      return { eventId: eventItem.eventId };
    }

    function authedEvent(eventId: string, userId: string): APIGatewayProxyEvent {
      return makeEvent({
        pathParameters: { eventId },
        requestContext: {
          authorizer: { principalId: userId, username: 'tester', email: '', groups: '' },
        } as unknown as APIGatewayProxyEvent['requestContext'],
      });
    }

    it('decorates each matchData with userHasRated / userRating for an authenticated caller', async () => {
      const { eventId } = await setupEventWithFiveMatches();

      // User u1 rated 2 of the 5 matches.
      await repos.matchRatings.create({ matchId: 'm1', userId: 'u1', rating: 5 });
      await repos.matchRatings.create({ matchId: 'm3', userId: 'u1', rating: 3 });
      // Noise from another user — must not leak.
      await repos.matchRatings.create({ matchId: 'm2', userId: 'other', rating: 4 });

      const result = await getEvent(authedEvent(eventId, 'u1'), ctx, cb);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      const byId = new Map<string, { userHasRated: boolean; userRating: number | null }>(
        body.enrichedMatches.map((em: { matchId: string; matchData: { userHasRated: boolean; userRating: number | null } }) =>
          [em.matchId, em.matchData],
        ),
      );
      expect(byId.get('m1')).toMatchObject({ userHasRated: true, userRating: 5 });
      expect(byId.get('m3')).toMatchObject({ userHasRated: true, userRating: 3 });
      expect(byId.get('m2')).toMatchObject({ userHasRated: false, userRating: null });
      expect(byId.get('m4')).toMatchObject({ userHasRated: false, userRating: null });
      expect(byId.get('m5')).toMatchObject({ userHasRated: false, userRating: null });
    });

    it('returns userHasRated=false and userRating=null on every matchData for unauthenticated callers', async () => {
      const { eventId } = await setupEventWithFiveMatches();
      // Other users' ratings must not leak to guests.
      await repos.matchRatings.create({ matchId: 'm1', userId: 'someone', rating: 5 });

      const result = await getEvent(makeEvent({ pathParameters: { eventId } }), ctx, cb);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      for (const em of body.enrichedMatches) {
        expect(em.matchData.userHasRated).toBe(false);
        expect(em.matchData.userRating).toBeNull();
      }
    });
  });
});
