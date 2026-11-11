import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
vi.mock('../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('./visibilityTestHelpers');
  return { authenticate: fakeAuthenticate };
});

import { buildInMemoryRepositories } from '../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../lib/repositories';
import type { Promo, PromoType } from '../../lib/repositories/types';
import { computeHeatForRivalry } from '../../lib/services/recomputeRivalryHeat';
import { handler as getPromos } from '../promos/getPromos';
import { handler as getPromo } from '../promos/getPromo';
import { handler as getFactionPromos } from '../stables/getFactionPromos';
import { handler as getActivity } from '../activity/getActivity';
import { handler as getRivalry } from '../rivalries/getRivalry';
import {
  handler as getRivalryActivity,
  _resetMemoForTesting,
} from '../rivalries/getRivalryActivity';
import { bearer, call, makeEvent, seedRoster, type RosterSeed } from './visibilityTestHelpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-15T12:00:00.000Z');
const content = 'x'.repeat(60);

interface PromoRow {
  promoId: string;
  isArchived?: boolean;
}

let repos: Repositories;
let roster: RosterSeed;

/** Creates a promo backdated by `ageDays`, as `createdAt` is set by the repository. */
async function promoAged(
  ageDays: number,
  promoType: PromoType,
  extra: { playerId?: string; rivalryId?: string; targetPromoId?: string } = {},
): Promise<Promo> {
  vi.setSystemTime(NOW - ageDays * DAY_MS);
  const promo = await repos.content.promos.create({
    playerId: roster.visibleId,
    promoType,
    content,
    ...extra,
  });
  vi.setSystemTime(NOW);
  return promo;
}

const promoIds = (rows: PromoRow[]): string[] => rows.map((row) => row.promoId);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  roster = await seedRoster(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.useRealTimers();
});

describe('getPromos archive filter', () => {
  it('drops old call-outs and responses but keeps fresh and other promos', async () => {
    const fresh = await promoAged(3.9, 'call-out');
    await promoAged(4.1, 'call-out');
    await promoAged(4.1, 'response');
    const openMic = await promoAged(30, 'open-mic');

    const { body } = await call<PromoRow[]>(getPromos, makeEvent());

    expect(promoIds(body).sort()).toEqual([fresh.promoId, openMic.promoId].sort());
  });

  it('keeps an old pinned call-out', async () => {
    const pinned = await promoAged(10, 'call-out');
    await repos.content.promos.update(pinned.promoId, { isPinned: true });

    const { body } = await call<PromoRow[]>(getPromos, makeEvent());

    expect(promoIds(body)).toEqual([pinned.promoId]);
  });

  it('does not write to the promo', async () => {
    const old = await promoAged(10, 'call-out');
    await call(getPromos, makeEvent());
    expect(await repos.content.promos.findById(old.promoId)).toEqual(old);
  });

  it('does not expose isArchived to the public', async () => {
    await promoAged(1, 'call-out');
    const { body } = await call<PromoRow[]>(getPromos, makeEvent());
    expect(body[0]).not.toHaveProperty('isArchived');
  });
});

describe('getPromos staff flags', () => {
  it.each(['Admin', 'Moderator'])('honours includeArchived for a %s', async (group) => {
    const old = await promoAged(10, 'call-out');
    const event = makeEvent({
      ...bearer('staff', group),
      queryStringParameters: { includeArchived: 'true' },
    });

    const { body } = await call<PromoRow[]>(getPromos, event);

    expect(promoIds(body)).toEqual([old.promoId]);
    expect(body[0].isArchived).toBe(true);
  });

  it('flags isArchived false on current promos for staff', async () => {
    await promoAged(1, 'call-out');
    const { body } = await call<PromoRow[]>(getPromos, makeEvent(bearer('staff', 'Admin')));
    expect(body[0].isArchived).toBe(false);
  });

  it.each([
    ['anonymous callers', {}],
    ['wrestlers', bearer('wrestler', 'Wrestler')],
    ['invalid tokens', { headers: { Authorization: 'Bearer invalid' } }],
  ])('ignores includeArchived and includeHidden for %s', async (_label, auth) => {
    await promoAged(10, 'call-out');
    const moderated = await promoAged(1, 'open-mic');
    await repos.content.promos.update(moderated.promoId, { isHidden: true });
    const event = makeEvent({
      ...auth,
      queryStringParameters: { includeArchived: 'true', includeHidden: 'true' },
    });

    const { statusCode, body } = await call<PromoRow[]>(getPromos, event);

    expect(statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it('honours includeHidden for staff', async () => {
    const moderated = await promoAged(1, 'open-mic');
    await repos.content.promos.update(moderated.promoId, { isHidden: true });
    const event = makeEvent({
      ...bearer('staff', 'Moderator'),
      queryStringParameters: { includeHidden: 'true' },
    });

    const { body } = await call<PromoRow[]>(getPromos, event);

    expect(promoIds(body)).toEqual([moderated.promoId]);
  });
});

describe('getPromos hidden authors', () => {
  it('leaves hidden authors\' promos out of the public feed', async () => {
    await promoAged(1, 'open-mic', { playerId: roster.placeholderId });
    const shown = await promoAged(1, 'open-mic');

    const { body } = await call<PromoRow[]>(getPromos, makeEvent());

    expect(promoIds(body)).toEqual([shown.promoId]);
  });

  it('shows them to staff using includeHidden', async () => {
    const promo = await promoAged(1, 'open-mic', { playerId: roster.placeholderId });
    const event = makeEvent({
      ...bearer('staff', 'Admin'),
      queryStringParameters: { includeHidden: 'true' },
    });

    const { body } = await call<PromoRow[]>(getPromos, event);

    expect(promoIds(body)).toEqual([promo.promoId]);
  });
});

describe('getPromo direct links', () => {
  it('stays open for an archived promo and shows archived responses in the thread', async () => {
    const callOut = await promoAged(10, 'call-out');
    const reply = await promoAged(9, 'response', { targetPromoId: callOut.promoId });

    const { statusCode, body } = await call<{ promo: PromoRow; responses: PromoRow[] }>(
      getPromo,
      makeEvent({ pathParameters: { promoId: callOut.promoId } }),
    );

    expect(statusCode).toBe(200);
    expect(body.promo.promoId).toBe(callOut.promoId);
    expect(promoIds(body.responses)).toEqual([reply.promoId]);
  });
});

describe('getFactionPromos', () => {
  it('drops archived promos and hidden authors before paginating', async () => {
    const stable = await repos.roster.stables.create({
      name: 'The Corporation',
      leaderId: roster.visibleId,
      memberIds: [roster.visibleId, roster.placeholderId],
      status: 'active',
    });
    const shown = await promoAged(30, 'open-mic');
    await promoAged(10, 'call-out');
    await promoAged(1, 'open-mic', { playerId: roster.placeholderId });

    const { body } = await call<{ items: PromoRow[]; nextCursor?: string }>(
      getFactionPromos,
      makeEvent({
        pathParameters: { stableId: stable.stableId },
        queryStringParameters: { limit: '1' },
      }),
    );

    expect(promoIds(body.items)).toEqual([shown.promoId]);
    expect(body.nextCursor).toBeUndefined();
  });
});

describe('getActivity', () => {
  it('leaves archived promos out of the feed', async () => {
    await promoAged(10, 'call-out');
    const shown = await promoAged(1, 'call-out');

    const { body } = await call<{ items: Array<{ id: string }> }>(getActivity, makeEvent());

    expect(body.items.map((item) => item.id)).toEqual([`promo-${shown.promoId}`]);
  });
});

describe('rivalry reads', () => {
  let rivalryId: string;

  beforeEach(async () => {
    _resetMemoForTesting();
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    const rivalry = await repos.rivalries.create({
      title: 'Feud',
      requestedBy: roster.visibleId,
      participants: [
        { playerId: roster.visibleId, role: 'instigator' },
        { playerId: rival.playerId, role: 'rival' },
      ],
    });
    rivalryId = rivalry.rivalryId;
    await repos.rivalries.update(rivalryId, { status: 'active' });
  });

  it('getRivalry fills recentPromos from unarchived promos only', async () => {
    const shown = await promoAged(30, 'open-mic');
    for (let n = 0; n < 6; n++) await promoAged(5, 'call-out');

    const { body } = await call<{ recentPromos: PromoRow[] }>(
      getRivalry,
      makeEvent({ pathParameters: { rivalryId } }),
    );

    expect(promoIds(body.recentPromos)).toEqual([shown.promoId]);
  });

  it('getRivalryActivity leaves archived promos out', async () => {
    const shown = await promoAged(1, 'call-out');
    await promoAged(10, 'call-out');

    const { body } = await call<{ items: Array<{ kind: string; promoId?: string }> }>(
      getRivalryActivity,
      makeEvent(),
    );

    expect(body.items.filter((item) => item.kind === 'promo').map((item) => item.promoId)).toEqual([
      shown.promoId,
    ]);
  });

  it('heat still counts archived call-outs', async () => {
    const callOut = await promoAged(30, 'call-out', { rivalryId });
    await repos.content.promos.update(callOut.promoId, {
      reactionCounts: { fire: 5, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
    });

    const result = await computeHeatForRivalry(rivalryId, []);

    expect(result.promoCount).toBe(1);
    expect(result.heatScore).toBeGreaterThan(0);
  });
});
