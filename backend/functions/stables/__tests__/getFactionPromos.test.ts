import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

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
import { handler as getFactionPromos } from '../getFactionPromos';

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(
  stableId: string,
  qs: Record<string, string> | null = null,
): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: `/stables/${stableId}/promos`,
    pathParameters: { stableId },
    queryStringParameters: qs,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
  };
}

async function makePlayer(name: string, wrestler: string): Promise<{ playerId: string }> {
  const p = await repos.roster.players.create({ name, currentWrestler: wrestler });
  return { playerId: p.playerId };
}

interface PromoSeed {
  promoId?: string;
  author: string;
  target?: string;
  content?: string;
  title?: string;
  promoType?: 'open-mic' | 'call-out' | 'response' | 'pre-match' | 'post-match' | 'championship' | 'return';
  createdAt: string;
  isHidden?: boolean;
}

async function makePromo(seed: PromoSeed): Promise<string> {
  vi.setSystemTime(new Date(seed.createdAt));
  const created = await repos.content.promos.create({
    playerId: seed.author,
    promoType: seed.promoType ?? 'open-mic',
    title: seed.title,
    content: seed.content ?? 'lorem ipsum',
    targetPlayerId: seed.target,
  });
  if (seed.isHidden) {
    await repos.content.promos.update(created.promoId, { isHidden: true });
  }
  return created.promoId;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-10T12:00:00.000Z'));
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getFactionPromos (FAC-08)', () => {
  it('returns 404 when the faction does not exist', async () => {
    const result = await getFactionPromos(makeEvent('does-not-exist'), ctx, cb);
    expect(result!.statusCode).toBe(404);
  });

  it('returns an empty list for a faction with no relevant promos', async () => {
    const a = await makePlayer('A', 'Rock');
    const stable = await repos.roster.stables.create({
      name: 'Empty',
      leaderId: a.playerId,
      memberIds: [a.playerId],
      status: 'active',
    });

    const result = await getFactionPromos(makeEvent(stable.stableId), ctx, cb);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.items).toEqual([]);
  });

  describe('filter modes', () => {
    async function seedFilterFixture() {
      const a1 = await makePlayer('A1', 'Rock');
      const a2 = await makePlayer('A2', 'Cena');
      const outsider = await makePlayer('Outsider', 'Orton');

      const stable = await repos.roster.stables.create({
        name: 'NWO',
        leaderId: a1.playerId,
        memberIds: [a1.playerId, a2.playerId],
        status: 'active',
      });

      // 1. Author=member, target=member (FEATURING)
      const featuring = await makePromo({
        author: a1.playerId,
        target: a2.playerId,
        content: 'inside the faction',
        createdAt: '2026-05-01T00:00:00.000Z',
      });
      // 2. Author=member, target=outsider (BY-FACTION but not featuring)
      const byFactionOnly = await makePromo({
        author: a1.playerId,
        target: outsider.playerId,
        content: 'a member calls out an outsider',
        createdAt: '2026-05-02T00:00:00.000Z',
      });
      // 3. Author=outsider, target=member (DIRECTED-AT-FACTION)
      const directedAt = await makePromo({
        author: outsider.playerId,
        target: a1.playerId,
        content: 'outsider responds',
        createdAt: '2026-05-03T00:00:00.000Z',
      });
      // 4. Author=outsider, target=outsider (NEITHER — should appear in none)
      await makePromo({
        author: outsider.playerId,
        target: outsider.playerId,
        content: 'unrelated',
        createdAt: '2026-05-04T00:00:00.000Z',
      });

      return { a1, a2, outsider, stable, featuring, byFactionOnly, directedAt };
    }

    it('filter=by-faction returns only promos authored by a member', async () => {
      const { stable, featuring, byFactionOnly } = await seedFilterFixture();

      const result = await getFactionPromos(
        makeEvent(stable.stableId, { filter: 'by-faction' }),
        ctx,
        cb,
      );
      const body = JSON.parse(result!.body);
      const ids = body.items.map((p: { promoId: string }) => p.promoId).sort();
      expect(ids).toEqual([featuring, byFactionOnly].sort());
    });

    it('filter=directed-at-faction returns only promos whose target is a member AND author is not', async () => {
      const { stable, directedAt } = await seedFilterFixture();

      const result = await getFactionPromos(
        makeEvent(stable.stableId, { filter: 'directed-at-faction' }),
        ctx,
        cb,
      );
      const body = JSON.parse(result!.body);
      const ids = body.items.map((p: { promoId: string }) => p.promoId);
      expect(ids).toEqual([directedAt]);
    });

    it('filter=featuring-faction returns only promos where BOTH author and target are members', async () => {
      const { stable, featuring } = await seedFilterFixture();

      const result = await getFactionPromos(
        makeEvent(stable.stableId, { filter: 'featuring-faction' }),
        ctx,
        cb,
      );
      const body = JSON.parse(result!.body);
      const ids = body.items.map((p: { promoId: string }) => p.promoId);
      expect(ids).toEqual([featuring]);
    });

    it('filter=all (default) returns the union: author OR target is a member', async () => {
      const { stable, featuring, byFactionOnly, directedAt } = await seedFilterFixture();

      const result = await getFactionPromos(makeEvent(stable.stableId), ctx, cb);
      const body = JSON.parse(result!.body);
      const ids = body.items.map((p: { promoId: string }) => p.promoId).sort();
      expect(ids).toEqual([featuring, byFactionOnly, directedAt].sort());
    });
  });

  it('drops hidden promos from the public feed', async () => {
    const a = await makePlayer('Author', 'Rock');
    const stable = await repos.roster.stables.create({
      name: 'X',
      leaderId: a.playerId,
      memberIds: [a.playerId],
      status: 'active',
    });

    await makePromo({
      author: a.playerId,
      content: 'visible',
      createdAt: '2026-05-01T00:00:00.000Z',
    });
    await makePromo({
      author: a.playerId,
      content: 'hidden',
      createdAt: '2026-05-02T00:00:00.000Z',
      isHidden: true,
    });

    const result = await getFactionPromos(makeEvent(stable.stableId), ctx, cb);
    const body = JSON.parse(result!.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].excerpt).toBe('visible');
  });

  it('sorts newest-first and paginates with the cursor', async () => {
    const a = await makePlayer('A', 'Rock');
    const stable = await repos.roster.stables.create({
      name: 'X',
      leaderId: a.playerId,
      memberIds: [a.playerId],
      status: 'active',
    });

    for (let i = 0; i < 5; i++) {
      const day = String(i + 1).padStart(2, '0');
      await makePromo({
        author: a.playerId,
        content: `p${i + 1}`,
        createdAt: `2026-05-${day}T00:00:00.000Z`,
      });
    }

    const first = JSON.parse(
      (await getFactionPromos(makeEvent(stable.stableId, { limit: '2' }), ctx, cb))!.body,
    );
    expect(first.items.map((p: { excerpt: string }) => p.excerpt)).toEqual(['p5', 'p4']);
    expect(first.nextCursor).toBeTruthy();

    const second = JSON.parse(
      (await getFactionPromos(
        makeEvent(stable.stableId, { limit: '2', cursor: first.nextCursor }),
        ctx,
        cb,
      ))!.body,
    );
    expect(second.items.map((p: { excerpt: string }) => p.excerpt)).toEqual(['p3', 'p2']);
    expect(second.nextCursor).toBeTruthy();

    const third = JSON.parse(
      (await getFactionPromos(
        makeEvent(stable.stableId, { limit: '2', cursor: second.nextCursor }),
        ctx,
        cb,
      ))!.body,
    );
    expect(third.items.map((p: { excerpt: string }) => p.excerpt)).toEqual(['p1']);
    expect(third.nextCursor).toBeUndefined();
  });

  it('hydrates author and target names', async () => {
    const a = await makePlayer('Author Name', 'Wrestler A');
    const t = await makePlayer('Target Name', 'Wrestler T');
    const stable = await repos.roster.stables.create({
      name: 'X',
      leaderId: a.playerId,
      memberIds: [a.playerId, t.playerId],
      status: 'active',
    });

    await makePromo({
      author: a.playerId,
      target: t.playerId,
      content: 'hi',
      title: 'Headline',
      createdAt: '2026-05-01T00:00:00.000Z',
    });

    const result = await getFactionPromos(makeEvent(stable.stableId), ctx, cb);
    const body = JSON.parse(result!.body);
    expect(body.items[0]).toMatchObject({
      authorPlayerName: 'Author Name',
      authorWrestlerName: 'Wrestler A',
      targetPlayerName: 'Target Name',
      targetWrestlerName: 'Wrestler T',
      headline: 'Headline',
    });
  });

  it('returns 400 for an unknown filter value', async () => {
    const a = await makePlayer('A', 'Rock');
    const stable = await repos.roster.stables.create({
      name: 'X',
      leaderId: a.playerId,
      memberIds: [a.playerId],
      status: 'active',
    });

    const result = await getFactionPromos(
      makeEvent(stable.stableId, { filter: 'invalid-mode' }),
      ctx,
      cb,
    );
    expect(result!.statusCode).toBe(400);
  });
});
