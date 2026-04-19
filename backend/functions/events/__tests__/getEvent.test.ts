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
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch event');
  });
});
