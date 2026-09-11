import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockCreateNotification } = vi.hoisted(() => ({
  mockCreateNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../lib/notifications', () => ({
  createNotification: mockCreateNotification,
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { Player } from '../../../lib/repositories';
import type { SuspensionRow } from '../../../lib/suspensions';

import { handler as suspendPlayer } from '../suspendPlayer';
import { handler as reinstatePlayer } from '../reinstatePlayer';
import { handler as getSuspensions } from '../getSuspensions';

// ─── Helpers ─────────────────────────────────────────────────────────

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function withAuth(
  event: APIGatewayProxyEvent,
  groups: string,
  sub = 'admin-sub-1',
): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'adminuser', email: 'admin@test.com', principalId: sub },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

function adminEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return withAuth(makeEvent(overrides), 'Admin');
}

async function seedPlayer(name: string, userId?: string): Promise<Player> {
  const created = await repos.roster.players.create({ name, currentWrestler: 'Wrestler' });
  if (userId) {
    return repos.roster.players.update(created.playerId, { userId });
  }
  return created;
}

async function seedCompletedEvent(name: string, date: string): Promise<void> {
  const created = await repos.leagueOps.events.create({ name, eventType: 'weekly', date });
  await repos.leagueOps.events.update(created.eventId, { status: 'completed' });
}

function futureIsoDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

function suspendEvent(playerId: string, body: Record<string, unknown>): APIGatewayProxyEvent {
  return adminEvent({
    httpMethod: 'POST',
    pathParameters: { playerId },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

// ─── suspendPlayer ───────────────────────────────────────────────────

describe('suspendPlayer', () => {
  it('suspends a player for a number of shows', async () => {
    const player = await seedPlayer('Alice', 'user-alice');

    const result = await suspendPlayer(
      suspendEvent(player.playerId, { showsRequired: 3, reason: 'No-show' }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body) as Player;
    expect(body.suspension).toBeDefined();
    expect(body.suspension!.showsRequired).toBe(3);
    expect(body.suspension!.until).toBeUndefined();
    expect(body.suspension!.reason).toBe('No-show');
    expect(body.suspension!.suspendedBy).toBe('admin@test.com');
    expect(typeof body.suspension!.suspendedAt).toBe('string');

    const stored = await repos.roster.players.findById(player.playerId);
    expect(stored!.suspension!.showsRequired).toBe(3);

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-alice',
        type: 'player_suspended',
        sourceType: 'suspension',
        sourceId: player.playerId,
      }),
    );
  });

  it('suspends a player until a future date', async () => {
    const player = await seedPlayer('Bob');
    const until = futureIsoDate(14);

    const result = await suspendPlayer(suspendEvent(player.playerId, { until }), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body) as Player;
    expect(body.suspension!.until).toBe(until);
    expect(body.suspension!.showsRequired).toBeUndefined();
    // No linked user, so no notification is sent.
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('returns 400 when both until and showsRequired are provided', async () => {
    const player = await seedPlayer('Carol');

    const result = await suspendPlayer(
      suspendEvent(player.playerId, { until: futureIsoDate(7), showsRequired: 2 }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/not both/);
  });

  it('returns 400 when neither until nor showsRequired is provided', async () => {
    const player = await seedPlayer('Dave');

    const result = await suspendPlayer(suspendEvent(player.playerId, { reason: 'x' }), ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toMatch(/either until/);
  });

  it('returns 409 when the player is already suspended', async () => {
    const player = await seedPlayer('Eve');
    await repos.roster.players.update(player.playerId, {
      suspension: { suspendedAt: new Date().toISOString(), showsRequired: 1 },
    });

    const result = await suspendPlayer(suspendEvent(player.playerId, { showsRequired: 2 }), ctx, cb);

    expect(result!.statusCode).toBe(409);
  });

  it('returns 404 when the player does not exist', async () => {
    const result = await suspendPlayer(suspendEvent('missing', { showsRequired: 2 }), ctx, cb);

    expect(result!.statusCode).toBe(404);
  });

  it('returns 403 for non-staff callers', async () => {
    const player = await seedPlayer('Frank');
    const event = withAuth(
      makeEvent({
        httpMethod: 'POST',
        pathParameters: { playerId: player.playerId },
        body: JSON.stringify({ showsRequired: 2 }),
      }),
      'Wrestler',
    );

    const result = await suspendPlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
  });
});

// ─── reinstatePlayer ─────────────────────────────────────────────────

describe('reinstatePlayer', () => {
  it('clears the suspension and notifies the player', async () => {
    const player = await seedPlayer('Grace', 'user-grace');
    await repos.roster.players.update(player.playerId, {
      suspension: { suspendedAt: new Date().toISOString(), showsRequired: 1 },
    });

    const result = await reinstatePlayer(
      adminEvent({ httpMethod: 'POST', pathParameters: { playerId: player.playerId } }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body) as Player;
    expect(body.suspension).toBeUndefined();

    const stored = await repos.roster.players.findById(player.playerId);
    expect(stored!.suspension).toBeUndefined();

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-grace',
        type: 'player_reinstated',
        sourceType: 'suspension',
        sourceId: player.playerId,
      }),
    );
  });

  it('returns 404 when the player is not suspended', async () => {
    const player = await seedPlayer('Heidi');

    const result = await reinstatePlayer(
      adminEvent({ httpMethod: 'POST', pathParameters: { playerId: player.playerId } }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(404);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('returns 404 when the player does not exist', async () => {
    const result = await reinstatePlayer(
      adminEvent({ httpMethod: 'POST', pathParameters: { playerId: 'missing' } }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(404);
  });

  it('returns 403 for non-staff callers', async () => {
    const player = await seedPlayer('Ivan');
    const event = withAuth(
      makeEvent({ httpMethod: 'POST', pathParameters: { playerId: player.playerId } }),
      'Wrestler',
    );

    const result = await reinstatePlayer(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
  });
});

// ─── getSuspensions ──────────────────────────────────────────────────

describe('getSuspensions', () => {
  it('returns only suspended players with eligibility computed from completed shows', async () => {
    const suspendedAt = '2026-01-01T00:00:00.000Z';
    const served = await seedPlayer('Served');
    const pending = await seedPlayer('Pending');
    await seedPlayer('Free');

    await repos.roster.players.update(served.playerId, {
      suspension: { suspendedAt, showsRequired: 2 },
    });
    await repos.roster.players.update(pending.playerId, {
      suspension: { suspendedAt, showsRequired: 5 },
    });

    // One show before the suspension (ignored), two after.
    await seedCompletedEvent('Before', '2025-12-20');
    await seedCompletedEvent('After 1', '2026-01-10');
    await seedCompletedEvent('After 2', '2026-01-17');

    const result = await getSuspensions(adminEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const rows = JSON.parse(result!.body) as SuspensionRow[];
    expect(rows.map((r) => r.playerId)).toEqual([served.playerId, pending.playerId]);

    expect(rows[0].showsServed).toBe(2);
    expect(rows[0].showsRemaining).toBe(0);
    expect(rows[0].eligibleForReinstatement).toBe(true);
    expect(rows[0].eligibleReason).toBe('shows');

    expect(rows[1].showsServed).toBe(2);
    expect(rows[1].showsRemaining).toBe(3);
    expect(rows[1].eligibleForReinstatement).toBe(false);
    expect(rows[1].eligibleReason).toBeNull();
  });

  it('ignores events that are not completed', async () => {
    const player = await seedPlayer('Judy');
    await repos.roster.players.update(player.playerId, {
      suspension: { suspendedAt: '2026-01-01T00:00:00.000Z', showsRequired: 1 },
    });
    await repos.leagueOps.events.create({ name: 'Upcoming', eventType: 'weekly', date: '2026-02-01' });

    const result = await getSuspensions(adminEvent(), ctx, cb);

    const rows = JSON.parse(result!.body) as SuspensionRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].showsServed).toBe(0);
    expect(rows[0].eligibleForReinstatement).toBe(false);
  });

  it('marks date-based suspensions eligible once the date has passed', async () => {
    const past = await seedPlayer('Past');
    const future = await seedPlayer('Future');
    await repos.roster.players.update(past.playerId, {
      suspension: { suspendedAt: '2026-01-01T00:00:00.000Z', until: '2026-01-15' },
    });
    await repos.roster.players.update(future.playerId, {
      suspension: { suspendedAt: '2025-12-01T00:00:00.000Z', until: futureIsoDate(30) },
    });

    const result = await getSuspensions(adminEvent(), ctx, cb);

    const rows = JSON.parse(result!.body) as SuspensionRow[];
    // Eligible first, even though the ineligible one was suspended earlier.
    expect(rows.map((r) => r.playerId)).toEqual([past.playerId, future.playerId]);
    expect(rows[0].eligibleReason).toBe('date');
    expect(rows[0].showsRemaining).toBeNull();
    expect(rows[1].eligibleForReinstatement).toBe(false);
  });

  it('sorts ineligible rows by suspendedAt ascending', async () => {
    const later = await seedPlayer('Later');
    const earlier = await seedPlayer('Earlier');
    await repos.roster.players.update(later.playerId, {
      suspension: { suspendedAt: '2026-03-01T00:00:00.000Z', showsRequired: 9 },
    });
    await repos.roster.players.update(earlier.playerId, {
      suspension: { suspendedAt: '2026-02-01T00:00:00.000Z', showsRequired: 9 },
    });

    const result = await getSuspensions(adminEvent(), ctx, cb);

    const rows = JSON.parse(result!.body) as SuspensionRow[];
    expect(rows.map((r) => r.playerId)).toEqual([earlier.playerId, later.playerId]);
  });

  it('returns an empty array when nobody is suspended', async () => {
    await seedPlayer('Solo');

    const result = await getSuspensions(adminEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('allows Moderators', async () => {
    const result = await getSuspensions(withAuth(makeEvent(), 'Moderator'), ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  it('returns 403 for non-staff callers', async () => {
    const result = await getSuspensions(withAuth(makeEvent(), 'Wrestler'), ctx, cb);

    expect(result!.statusCode).toBe(403);
  });
});
