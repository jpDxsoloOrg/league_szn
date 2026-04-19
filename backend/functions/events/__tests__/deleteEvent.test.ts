import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';

import { handler as deleteEvent } from '../deleteEvent';

// ─── Helpers ─────────────────────────────────────────────────────────

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'DELETE',
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

describe('deleteEvent', () => {
  it('returns 400 when eventId path parameter is missing', async () => {
    const result = await deleteEvent(makeEvent({ pathParameters: null }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Event ID is required');
  });

  it('returns 404 when event does not exist', async () => {
    const event = makeEvent({ pathParameters: { eventId: 'nonexistent' } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Event not found');
  });

  it('deletes event with empty matchCards and returns 204', async () => {
    const eventItem = await repos.leagueOps.events.create({
      name: 'Test', eventType: 'ppv', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, { matchCards: [] });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(await repos.leagueOps.events.findById(eventItem.eventId)).toBeNull();
  });

  it('deletes event when matchCards property is undefined', async () => {
    const eventItem = await repos.leagueOps.events.create({
      name: 'Test', eventType: 'ppv', date: '2024-01-01',
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
  });

  it('deletes event when matchCards have no matchId values', async () => {
    const eventItem = await repos.leagueOps.events.create({
      name: 'Test', eventType: 'ppv', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [{ position: 1, designation: 'pre-show' } as { position: number; matchId: string; designation: 'pre-show' }],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
  });

  it('deletes event when associated matches are not completed', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01', status: 'scheduled',
      participants: [], createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-01', status: 'in-progress',
      participants: [], createdAt: new Date().toISOString(),
    });

    const eventItem = await repos.leagueOps.events.create({
      name: 'Test', eventType: 'ppv', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [
        { position: 1, matchId: 'm1', designation: 'main-event' as const },
        { position: 2, matchId: 'm2', designation: 'opener' as const },
      ],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
  });

  it('returns 409 when event has a completed match', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01', status: 'completed',
      participants: [], createdAt: new Date().toISOString(),
    });

    const eventItem = await repos.leagueOps.events.create({
      name: 'Test', eventType: 'ppv', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [{ position: 1, matchId: 'm1', designation: 'main-event' as const }],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toContain('Cannot delete event');
    expect(JSON.parse(result!.body).message).toContain('1 completed match(es)');
  });

  it('returns 409 with correct count for multiple completed matches', async () => {
    await repos.competition.matches.create({
      matchId: 'm1', date: '2024-01-01', status: 'completed',
      participants: [], createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm2', date: '2024-01-02', status: 'completed',
      participants: [], createdAt: new Date().toISOString(),
    });
    await repos.competition.matches.create({
      matchId: 'm3', date: '2024-01-03', status: 'scheduled',
      participants: [], createdAt: new Date().toISOString(),
    });

    const eventItem = await repos.leagueOps.events.create({
      name: 'Test', eventType: 'ppv', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [
        { position: 1, matchId: 'm1', designation: 'main-event' as const },
        { position: 2, matchId: 'm2', designation: 'co-main' as const },
        { position: 3, matchId: 'm3', designation: 'opener' as const },
      ],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toContain('2 completed match(es)');
  });

  it('allows deletion when match lookup returns no match', async () => {
    const eventItem = await repos.leagueOps.events.create({
      name: 'Test', eventType: 'ppv', date: '2024-01-01',
    });
    await repos.leagueOps.events.update(eventItem.eventId, {
      matchCards: [{ position: 1, matchId: 'm-deleted', designation: 'midcard' as const }],
    });

    const event = makeEvent({ pathParameters: { eventId: eventItem.eventId } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
  });

  it('returns 500 when repository fails', async () => {
    vi.spyOn(repos.leagueOps.events, 'findById').mockRejectedValue(new Error('DB error'));
    const event = makeEvent({ pathParameters: { eventId: 'e1' } });

    const result = await deleteEvent(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to delete event');
  });
});
