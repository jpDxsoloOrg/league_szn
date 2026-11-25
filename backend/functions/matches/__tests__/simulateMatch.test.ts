import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

vi.mock('../../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('../../__tests__/visibilityTestHelpers');
  // No Authorization header behaves like a missing token.
  return {
    authenticate: async (event: APIGatewayProxyEvent) =>
      event.headers.Authorization ? fakeAuthenticate(event) : { ok: false },
  };
});

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as matchesRouter } from '../handler';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import type { SimulateResponse } from '../simulateMatch';

type Auth = Pick<APIGatewayProxyEvent, 'headers'>;
const ADMIN: Auth = bearer('admin-sub', 'Admin');
const MODERATOR: Auth = bearer('mod-sub', 'Moderator');
const WRESTLER: Auth = bearer('wrestler-sub', 'Wrestler');
const FANTASY: Auth = bearer('fantasy-sub', 'Fantasy');
const NO_TOKEN: Auth = { headers: {} };

const MATCH_ID = 'match-1';

let repos: Repositories;
let rockId: string;
let austinId: string;
let mankindId: string;

const simulateRequest = (body: unknown, auth: Auth = MODERATOR) =>
  call<SimulateResponse & { message?: string }>(matchesRouter, makeEvent({
    ...auth,
    httpMethod: 'POST',
    resource: '/simulate',
    path: '/simulate',
    body: JSON.stringify(body),
  }));

/** Names that change data on a repository. */
const WRITE_METHOD = /^(create|update|delete|put|upsert|increment|decrement|remove|set|save|write|close|reopen|deactivate|mark|record|add|append|apply|adjust|clear|batch|soft|restore)/i;

/** Spy on every write method of every repository, plus runInTransaction. */
function spyOnWrites(root: Repositories): MockInstance[] {
  const spies: MockInstance[] = [];
  const visited = new Set<object>();
  const visit = (target: unknown, depth: number): void => {
    if (!target || typeof target !== 'object' || visited.has(target) || depth > 4) return;
    visited.add(target);
    const record = target as Record<string, unknown>;
    const names = new Set<string>();
    for (let proto: object | null = target; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      Object.getOwnPropertyNames(proto).forEach((name) => names.add(name));
    }
    for (const name of names) {
      if (name === 'constructor') continue;
      const value = record[name];
      if (typeof value === 'function') {
        if (WRITE_METHOD.test(name) || name === 'runInTransaction') {
          spies.push(vi.spyOn(record as Record<string, (...args: unknown[]) => unknown>, name));
        }
      } else {
        visit(value, depth + 1);
      }
    }
  };
  visit(root, 0);
  return spies;
}

async function addPlayer(name: string): Promise<string> {
  return (await repos.roster.players.create({ name, currentWrestler: name })).playerId;
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  rockId = await addPlayer('The Rock');
  austinId = await addPlayer('Stone Cold');
  mankindId = await addPlayer('Mankind');
  await repos.roster.players.update(rockId, {
    finishers: [{ gameName: 'Rock Bottom', customName: '', level: 5 }],
    signatures: [{ gameName: 'Spinebuster', customName: "People's Elbow", level: 4 }],
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('POST /simulate access', () => {
  const body = () => ({ sides: [[rockId], [austinId]], seed: 7 });

  it('rejects a caller with no token (401)', async () => {
    expect((await simulateRequest(body(), NO_TOKEN)).statusCode).toBe(401);
  });

  it('rejects Wrestler and Fantasy callers (403)', async () => {
    expect((await simulateRequest(body(), WRESTLER)).statusCode).toBe(403);
    expect((await simulateRequest(body(), FANTASY)).statusCode).toBe(403);
  });

  it('allows Moderator and Admin (200)', async () => {
    expect((await simulateRequest(body(), MODERATOR)).statusCode).toBe(200);
    expect((await simulateRequest(body(), ADMIN)).statusCode).toBe(200);
  });
});

describe('POST /simulate with sides', () => {
  it('returns odds, a winner and a play-by-play', async () => {
    const { statusCode, body } = await simulateRequest({ sides: [[rockId], [austinId]], seed: 123 });

    expect(statusCode).toBe(200);
    expect(body.seed).toBe(123);
    expect(body.category).toBe('standard');
    expect(body.probabilities.map((entry) => entry.playerIds)).toEqual([[rockId], [austinId]]);
    const totalPct = body.probabilities.reduce((sum, entry) => sum + entry.pct, 0);
    expect(totalPct).toBeCloseTo(100, 0);
    expect(['side-1', 'side-2']).toContain(body.winnerSideId);
    expect(body.playByPlay.length).toBeGreaterThan(0);
    expect(body.playByPlay.every((beat) => beat.key.startsWith('sim.beats.'))).toBe(true);
    expect(body.specialtyHits).toEqual([]);
    expect(body.formWindow).toEqual({ kind: 'recent', matchLimit: 10 });
  });

  it('gives the same response for the same seed', async () => {
    const request = { sides: [[rockId, mankindId], [austinId]], seed: 99 };
    const first = await simulateRequest(request);
    const second = await simulateRequest(request);
    expect(second.body).toEqual(first.body);
  });

  it('draws a random seed when none is given', async () => {
    const { statusCode, body } = await simulateRequest({ sides: [[rockId], [austinId]] });
    expect(statusCode).toBe(200);
    expect(Number.isInteger(body.seed)).toBe(true);
    // Replaying the returned seed reproduces the result.
    const replay = await simulateRequest({ sides: [[rockId], [austinId]], seed: body.seed });
    expect(replay.body).toEqual(body);
  });

  it('uses the stipulation sim category', async () => {
    const stipulation = await repos.competition.stipulations.create({ name: 'Ladder Match', simCategory: 'highRisk' });
    const { body } = await simulateRequest({
      sides: [[rockId], [austinId]],
      stipulationId: stipulation.stipulationId,
      seed: 1,
    });
    expect(body.category).toBe('highRisk');
  });

  it('rejects an unknown player (400)', async () => {
    const { statusCode, body } = await simulateRequest({ sides: [[rockId], ['ghost']], seed: 1 });
    expect(statusCode).toBe(400);
    expect(body.message).toContain('ghost');
  });

  it.each([
    ['one side', { sides: [['a']] }],
    ['nine sides', { sides: Array.from({ length: 9 }, (_, index) => [`p${index}`]) }],
    ['an empty side', { sides: [['a'], []] }],
    ['five members', { sides: [['a', 'b', 'c', 'd', 'e'], ['f']] }],
    ['a repeated player', { sides: [['a'], ['a']] }],
    ['both matchId and sides', { matchId: MATCH_ID, sides: [['a'], ['b']] }],
    ['neither matchId nor sides', {}],
    ['a bad seed', { sides: [['a'], ['b']], seed: -1 }],
    ['an unknown stipulation', { sides: [['a'], ['b']], stipulationId: 'nope' }],
  ])('rejects %s (400)', async (_label, request) => {
    expect((await simulateRequest(request)).statusCode).toBe(400);
  });
});

describe('POST /simulate with matchId', () => {
  async function createMatch(fields: Record<string, unknown> = {}): Promise<void> {
    await repos.competition.matches.create({
      matchId: MATCH_ID,
      date: '2026-11-30T20:00:00.000Z',
      participants: [rockId, austinId],
      status: 'scheduled',
      ...fields,
    });
  }

  it('simulates a scheduled match with its sides and category', async () => {
    const stipulation = await repos.competition.stipulations.create({ name: 'Cage', simCategory: 'cage' });
    await createMatch({
      participants: [rockId, mankindId, austinId],
      teams: [[rockId, mankindId], [austinId]],
      stipulationId: stipulation.stipulationId,
    });

    const { statusCode, body } = await simulateRequest({ matchId: MATCH_ID, seed: 5 });

    expect(statusCode).toBe(200);
    expect(body.matchId).toBe(MATCH_ID);
    expect(body.category).toBe('cage');
    expect(body.probabilities.map((entry) => entry.playerIds)).toEqual([[rockId, mankindId], [austinId]]);
  });

  it('rejects a completed match as already decided (400)', async () => {
    await createMatch({ status: 'completed', winners: [rockId], losers: [austinId] });
    const { statusCode, body } = await simulateRequest({ matchId: MATCH_ID });
    expect(statusCode).toBe(400);
    expect(body.message).toMatch(/already decided/i);
  });

  it('returns 404 for an unknown match', async () => {
    expect((await simulateRequest({ matchId: 'missing' })).statusCode).toBe(404);
  });
});

// INJ-09
describe('POST /simulate stamina and injuries', () => {
  it('leaves conditions out while the injuries feature is off', async () => {
    await repos.runInTransaction(async (tx) => tx.updatePlayerCondition(austinId, { stamina: 10 }));
    const { statusCode, body } = await simulateRequest({ sides: [[rockId], [austinId]], seed: 5 });
    expect(statusCode).toBe(200);
    expect(body.conditions).toBeUndefined();
  });

  it('shows each competitor\'s stamina, injury and multiplier, and the tired side loses odds', async () => {
    const before = await simulateRequest({ sides: [[rockId], [austinId]], seed: 5 });
    await repos.user.siteConfig.updateFeatures({ injuries: true });
    await repos.runInTransaction(async (tx) => tx.updatePlayerCondition(austinId, {
      stamina: 20,
      currentInjury: {
        injuryId: 'inj-1',
        startedAt: '2020-01-01T00:00:00.000Z',
        returnsAt: '2999-01-01T00:00:00.000Z',
        severity: 'minor',
        weeks: 1,
        source: 'match',
      },
    }));

    const { statusCode, body } = await simulateRequest({ sides: [[rockId], [austinId]], seed: 5 });
    expect(statusCode).toBe(200);
    expect(body.conditions).toEqual([
      { playerId: rockId, stamina: 100, maxStamina: 100, injured: false, multiplier: 1 },
      { playerId: austinId, stamina: 20, maxStamina: 100, injured: true, multiplier: expect.any(Number) },
    ]);
    expect(body.conditions?.[1].multiplier).toBeLessThan(1);
    expect(body.probabilities[1].pct).toBeLessThan(before.body.probabilities[1].pct);
    expect(body.inputsDigest).not.toBe(before.body.inputsDigest);
  });
});

describe('POST /simulate writes nothing', () => {
  it('never calls a repository write method', async () => {
    await repos.competition.matches.create({
      matchId: MATCH_ID,
      date: '2026-11-30T20:00:00.000Z',
      participants: [rockId, austinId],
      status: 'scheduled',
    });
    const spies = spyOnWrites(repos);
    expect(spies.length).toBeGreaterThan(10);

    expect((await simulateRequest({ matchId: MATCH_ID, seed: 3 })).statusCode).toBe(200);
    expect((await simulateRequest({ sides: [[rockId], [austinId], [mankindId]], seed: 4 })).statusCode).toBe(200);

    const called = spies.filter((spy) => spy.mock.calls.length > 0).map((spy) => spy.getMockName());
    expect(called).toEqual([]);
    const match = await repos.competition.matches.findById(MATCH_ID);
    expect(match?.status).toBe('scheduled');
    expect(match?.winners).toBeUndefined();
  });
});
