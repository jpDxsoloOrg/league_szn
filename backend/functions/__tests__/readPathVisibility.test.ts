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
import type { Promo } from '../../lib/repositories/types';
import { handler as getPromos } from '../promos/getPromos';
import { handler as getPromo } from '../promos/getPromo';
import { handler as getVideo } from '../videos/getVideo';
import { handler as getActivity } from '../activity/getActivity';
import { handler as getRivalry } from '../rivalries/getRivalry';
import { handler as getRivalries } from '../rivalries/getRivalries';
import {
  handler as getRivalryActivity,
  _resetMemoForTesting as resetActivityMemo,
} from '../rivalries/getRivalryActivity';
import { handler as getDashboard } from '../dashboard/getDashboard';
import { handler as getMatches } from '../matches/getMatches';
import { handler as getEvent } from '../events/getEvent';
import { handler as updateCompany } from '../companies/updateCompany';
import { handler as updateShow } from '../shows/updateShow';
import { handler as updateSeason } from '../seasons/updateSeason';
import { bearer, call, makeEvent, seedRoster, type RosterSeed } from './visibilityTestHelpers';

const content = 'x'.repeat(60);

interface PromoRow {
  promoId: string;
  responseCount?: number;
  targetPromo?: { title?: string };
}

let repos: Repositories;
let roster: RosterSeed;

async function createPromo(
  extra: Partial<Pick<Promo, 'playerId' | 'title' | 'targetPromoId'>> = {},
  isHidden = false,
): Promise<Promo> {
  const promo = await repos.content.promos.create({
    playerId: roster.visibleId,
    promoType: 'open-mic',
    content,
    ...extra,
  });
  return isHidden ? repos.content.promos.update(promo.promoId, { isHidden: true }) : promo;
}

const linkUser = (playerId: string, userId: string) =>
  repos.roster.players.update(playerId, { userId });

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  roster = await seedRoster(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('getPromo moderated promos', () => {
  const eventFor = (promoId: string, auth = {}) =>
    makeEvent({ ...auth, pathParameters: { promoId } });

  it.each([
    ['anonymous callers', {}],
    ['invalid tokens', { headers: { Authorization: 'Bearer invalid' } }],
    ['other wrestlers', bearer('someone-else', 'Wrestler')],
  ])('404s for %s', async (_label, auth) => {
    const promo = await createPromo({}, true);

    const { statusCode } = await call(getPromo, eventFor(promo.promoId, auth));

    expect(statusCode).toBe(404);
  });

  it('serves the author', async () => {
    await linkUser(roster.visibleId, 'author-sub');
    const promo = await createPromo({}, true);

    const { statusCode } = await call(
      getPromo,
      eventFor(promo.promoId, bearer('author-sub', 'Wrestler')),
    );

    expect(statusCode).toBe(200);
  });

  it.each(['Admin', 'Moderator'])('serves a %s', async (group) => {
    const promo = await createPromo({}, true);

    const { statusCode } = await call(getPromo, eventFor(promo.promoId, bearer('staff', group)));

    expect(statusCode).toBe(200);
  });

  it('404s a hidden author\'s promo except for them and staff', async () => {
    await linkUser(roster.placeholderId, 'hidden-sub');
    const promo = await createPromo({ playerId: roster.placeholderId });
    const statusFor = async (auth = {}) =>
      (await call(getPromo, eventFor(promo.promoId, auth))).statusCode;

    expect(await statusFor()).toBe(404);
    expect(await statusFor(bearer('hidden-sub', 'Wrestler'))).toBe(200);
    expect(await statusFor(bearer('staff', 'Moderator'))).toBe(200);
  });

  it('leaves a hidden author\'s response out of the thread and the count', async () => {
    await linkUser(roster.placeholderId, 'hidden-sub');
    const root = await createPromo();
    const shown = await createPromo({ targetPromoId: root.promoId });
    const hiddenReply = await createPromo({
      targetPromoId: root.promoId,
      playerId: roster.placeholderId,
    });
    const thread = async (auth = {}) =>
      (await call<{ promo: PromoRow; responses: PromoRow[] }>(getPromo, eventFor(root.promoId, auth))).body;

    const publicThread = await thread();
    expect(publicThread.responses.map((row) => row.promoId)).toEqual([shown.promoId]);
    expect(publicThread.promo.responseCount).toBe(1);

    const ownThread = await thread(bearer('hidden-sub', 'Wrestler'));
    expect(ownThread.responses.map((row) => row.promoId)).toContain(hiddenReply.promoId);
  });

  it('leaves a hidden author\'s target out of a public response', async () => {
    const target = await createPromo({ playerId: roster.placeholderId, title: 'Hidden' });
    const reply = await createPromo({ targetPromoId: target.promoId });

    const { body } = await call<{ promo: PromoRow }>(getPromo, eventFor(reply.promoId));

    expect(body.promo.targetPromo).toBeUndefined();
  });

  it('leaves a moderated target out of a public response', async () => {
    const target = await createPromo({ title: 'Removed' }, true);
    const reply = await createPromo({ targetPromoId: target.promoId });

    const { statusCode, body } = await call<{ promo: PromoRow }>(getPromo, eventFor(reply.promoId));

    expect(statusCode).toBe(200);
    expect(body.promo.targetPromo).toBeUndefined();
  });

  it('keeps a moderated target for staff', async () => {
    const target = await createPromo({ title: 'Removed' }, true);
    const reply = await createPromo({ targetPromoId: target.promoId });

    const { body } = await call<{ promo: PromoRow }>(
      getPromo,
      eventFor(reply.promoId, bearer('staff', 'Admin')),
    );

    expect(body.promo.targetPromo?.title).toBe('Removed');
  });
});

describe('getPromos', () => {
  it('lets a hidden player see their own promos', async () => {
    await linkUser(roster.placeholderId, 'hidden-sub');
    const own = await createPromo({ playerId: roster.placeholderId });
    await createPromo({ playerId: roster.blankId });

    const { body } = await call<PromoRow[]>(
      getPromos,
      makeEvent(bearer('hidden-sub', 'Wrestler')),
    );

    expect(body.map((row) => row.promoId)).toEqual([own.promoId]);
  });

  it('keeps a hidden player\'s promos from other callers', async () => {
    await linkUser(roster.placeholderId, 'hidden-sub');
    await createPromo({ playerId: roster.placeholderId });

    const { body } = await call<PromoRow[]>(getPromos, makeEvent(bearer('other', 'Wrestler')));

    expect(body).toEqual([]);
  });

  it('does not show a hidden player their own moderated promos in the feed', async () => {
    await linkUser(roster.placeholderId, 'hidden-sub');
    await createPromo({ playerId: roster.placeholderId }, true);

    const { body } = await call<PromoRow[]>(
      getPromos,
      makeEvent(bearer('hidden-sub', 'Wrestler')),
    );

    expect(body).toEqual([]);
  });

  it('serves the public view when the caller lookup fails', async () => {
    await createPromo({ playerId: roster.placeholderId });
    vi.spyOn(repos.roster.players, 'findByUserId').mockRejectedValue(new Error('lookup failed'));

    const { statusCode, body } = await call<PromoRow[]>(
      getPromos,
      makeEvent(bearer('hidden-sub', 'Wrestler')),
    );

    expect(statusCode).toBe(200);
    expect(body).toEqual([]);
  });

  it('keeps moderated promos out of the embedded target and the response count', async () => {
    const target = await createPromo({ title: 'Removed' }, true);
    const reply = await createPromo({ targetPromoId: target.promoId });
    const parent = await createPromo();
    await createPromo({ targetPromoId: parent.promoId }, true);

    const { body } = await call<PromoRow[]>(getPromos, makeEvent());

    expect(body.find((row) => row.promoId === reply.promoId)?.targetPromo).toBeUndefined();
    expect(body.find((row) => row.promoId === parent.promoId)?.responseCount).toBe(0);
  });
});

describe('moderated promos in other feeds', () => {
  it('getActivity leaves them out', async () => {
    await createPromo({}, true);
    const shown = await createPromo();

    const { body } = await call<{ items: Array<{ id: string }> }>(getActivity, makeEvent());

    expect(body.items.map((item) => item.id)).toEqual([`promo-${shown.promoId}`]);
  });

  it('getRivalry leaves them out before taking the recent five', async () => {
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    const { rivalryId } = await repos.rivalries.create({
      title: 'Feud',
      requestedBy: roster.visibleId,
      participants: [
        { playerId: roster.visibleId, role: 'instigator' },
        { playerId: rival.playerId, role: 'rival' },
      ],
    });
    const shown = await createPromo();
    for (let count = 0; count < 6; count++) await createPromo({}, true);

    const { body } = await call<{ recentPromos: PromoRow[] }>(
      getRivalry,
      makeEvent({ pathParameters: { rivalryId } }),
    );

    expect(body.recentPromos.map((row) => row.promoId)).toEqual([shown.promoId]);
  });
});

describe('getRivalryActivity', () => {
  interface ActivityRow {
    kind: string;
    promoId?: string;
    body?: string;
  }

  const activate = async (playerIds: string[]): Promise<string> => {
    const { rivalryId } = await repos.rivalries.create({
      title: 'Feud',
      requestedBy: playerIds[0],
      participants: playerIds.map((playerId) => ({ playerId })),
    });
    await repos.rivalries.update(rivalryId, { status: 'active' });
    return rivalryId;
  };

  const feed = async (auth = {}, participantId?: string): Promise<ActivityRow[]> => {
    const { body } = await call<{ items: ActivityRow[] }>(
      getRivalryActivity,
      makeEvent({
        ...auth,
        queryStringParameters: participantId ? { participantId } : null,
      }),
    );
    return body.items;
  };

  beforeEach(() => resetActivityMemo());

  it('leaves moderated promos out', async () => {
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    await activate([roster.visibleId, rival.playerId]);
    await createPromo({}, true);
    const shown = await createPromo();

    const promos = (await feed()).filter((item) => item.kind === 'promo');

    expect(promos.map((item) => item.promoId)).toEqual([shown.promoId]);
  });

  it('keeps participant-only items from another player on a warm cache', async () => {
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    const outsider = await repos.roster.players.create({ name: 'O', currentWrestler: 'Sting' });
    await linkUser(roster.visibleId, 'insider-sub');
    await linkUser(outsider.playerId, 'outsider-sub');
    const rivalryId = await activate([roster.visibleId, rival.playerId]);
    await repos.rivalryMessages.post({
      rivalryId,
      authorPlayerId: roster.visibleId,
      body: 'participants only',
      audience: 'participants',
    });

    const insider = await feed(bearer('insider-sub', 'Wrestler'), roster.visibleId);
    const other = await feed(bearer('outsider-sub', 'Wrestler'), roster.visibleId);

    expect(insider.map((item) => item.body)).toContain('participants only');
    expect(other.map((item) => item.body)).not.toContain('participants only');
  });

  it('gives each caller their own page whichever order they ask in', async () => {
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    const outsider = await repos.roster.players.create({ name: 'O', currentWrestler: 'Sting' });
    await linkUser(roster.visibleId, 'insider-sub');
    await linkUser(outsider.playerId, 'outsider-sub');
    const rivalryId = await activate([roster.visibleId, rival.playerId]);
    await repos.rivalryMessages.post({
      rivalryId,
      authorPlayerId: roster.visibleId,
      body: 'participants only',
      audience: 'participants',
    });

    await feed(bearer('outsider-sub', 'Wrestler'), roster.visibleId);
    const insider = await feed(bearer('insider-sub', 'Wrestler'), roster.visibleId);

    expect(insider.map((item) => item.body)).toContain('participants only');
  });

  it('leaves an active rivalry with a hidden participant out of the public feed', async () => {
    const rivalryId = await activate([roster.visibleId, roster.placeholderId]);
    await repos.rivalryMessages.post({
      rivalryId,
      authorPlayerId: roster.visibleId,
      body: 'open message',
    });

    expect(await feed()).toEqual([]);
  });
});

describe('getRivalries with a hidden participant', () => {
  interface RivalryList {
    rivalries: Array<{ rivalryId: string }>;
  }

  const seedRivalry = async (status: 'active' | 'completed'): Promise<string> => {
    const { rivalryId } = await repos.rivalries.create({
      title: 'Feud',
      requestedBy: roster.visibleId,
      participants: [{ playerId: roster.visibleId }, { playerId: roster.placeholderId }],
    });
    await repos.rivalries.update(rivalryId, { status });
    return rivalryId;
  };

  const listIds = async (status: string, auth = {}): Promise<string[]> => {
    const { body } = await call<RivalryList>(
      getRivalries,
      makeEvent({ ...auth, queryStringParameters: { status } }),
    );
    return body.rivalries.map((rivalry) => rivalry.rivalryId);
  };

  it('drops an active rivalry from the public list', async () => {
    await seedRivalry('active');

    expect(await listIds('active')).toEqual([]);
  });

  it('keeps it for staff and for its participants', async () => {
    const rivalryId = await seedRivalry('active');
    await linkUser(roster.placeholderId, 'hidden-sub');

    expect(await listIds('active', bearer('staff', 'Moderator'))).toEqual([rivalryId]);
    expect(await listIds('active', bearer('hidden-sub', 'Wrestler'))).toEqual([rivalryId]);
  });

  it('keeps a completed rivalry as history', async () => {
    const rivalryId = await seedRivalry('completed');

    expect(await listIds('completed')).toEqual([rivalryId]);
  });
});

describe('getActivity type filter', () => {
  it('reads only the requested source and the player names', async () => {
    const listCompleted = vi.spyOn(repos.competition.matches, 'listCompleted');
    const listPromos = vi.spyOn(repos.content.promos, 'list');
    const listPlayers = vi.spyOn(repos.roster.players, 'list');

    await call(getActivity, makeEvent({ queryStringParameters: { type: 'promo' } }));

    expect(listPromos).toHaveBeenCalledTimes(1);
    expect(listPlayers).toHaveBeenCalledTimes(1);
    expect(listCompleted).not.toHaveBeenCalled();
  });
});

describe('getVideo drafts', () => {
  const createVideo = (isPublished: boolean) =>
    repos.content.videos.create({
      title: 'Clip',
      videoUrl: 'https://example.com/clip.mp4',
      category: 'match',
      isPublished,
      uploadedBy: roster.visibleId,
    });
  const eventFor = (videoId: string, auth = {}) =>
    makeEvent({ ...auth, pathParameters: { videoId } });

  it('serves a published video to anyone', async () => {
    const { videoId } = await createVideo(true);

    expect((await call(getVideo, eventFor(videoId))).statusCode).toBe(200);
  });

  it.each([
    ['anonymous callers', {}],
    ['invalid tokens', { headers: { Authorization: 'Bearer invalid' } }],
    ['other wrestlers', bearer('someone-else', 'Wrestler')],
  ])('404s a draft for %s', async (_label, auth) => {
    const { videoId } = await createVideo(false);

    expect((await call(getVideo, eventFor(videoId, auth))).statusCode).toBe(404);
  });

  it('serves a draft to its uploader', async () => {
    await linkUser(roster.visibleId, 'uploader-sub');
    const { videoId } = await createVideo(false);

    const { statusCode } = await call(
      getVideo,
      eventFor(videoId, bearer('uploader-sub', 'Wrestler')),
    );

    expect(statusCode).toBe(200);
  });

  it.each(['Admin', 'Moderator'])('serves a draft to a %s', async (group) => {
    const { videoId } = await createVideo(false);

    expect((await call(getVideo, eventFor(videoId, bearer('staff', group)))).statusCode).toBe(200);
  });
});

describe('getDashboard recent results', () => {
  interface Dashboard {
    recentResults: Array<{ winnerName: string; loserName: string }>;
  }

  it.each([
    ['the placeholder', 'placeholderId', 'Placeholder Person'],
    ['a blank wrestler name', 'blankId', 'Blank Person'],
  ] as const)('names a player holding %s', async (_label, key, expected) => {
    const now = new Date().toISOString();
    await repos.competition.matches.create({
      matchId: 'm1',
      date: now,
      matchFormat: 'singles',
      participants: [roster.visibleId, roster[key]],
      winners: [roster.visibleId],
      losers: [roster[key]],
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    });

    const { body } = await call<Dashboard>(getDashboard, makeEvent());

    expect(body.recentResults[0].winnerName).toBe('The Rock');
    expect(body.recentResults[0].loserName).toBe(expected);
  });
});

describe('500 responses', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('getMatches keeps the error detail in the log only', async () => {
    vi.spyOn(repos.competition.matches, 'list').mockRejectedValue(new Error('table detail'));

    const { statusCode, body } = await call<{ message: string }>(getMatches, makeEvent());

    expect(statusCode).toBe(500);
    expect(body.message).toBe('Failed to fetch matches');
    expect(console.error).toHaveBeenCalled();
  });

  it('getEvent keeps the error detail in the log only', async () => {
    vi.spyOn(repos.leagueOps.events, 'findById').mockRejectedValue(new Error('table detail'));

    const { statusCode, body } = await call<{ message: string }>(
      getEvent,
      makeEvent({ pathParameters: { eventId: 'e1' } }),
    );

    expect(statusCode).toBe(500);
    expect(body.message).toBe('Failed to fetch event');
  });

  it('getDashboard keeps the error detail in the log only', async () => {
    vi.spyOn(repos.leagueOps.events, 'listByStatus').mockResolvedValue([]);
    const failing = makeEvent();
    Object.defineProperty(failing, 'headers', {
      get() {
        throw new Error('table detail');
      },
    });

    const { statusCode, body } = await call<{ message: string }>(getDashboard, failing);

    expect(statusCode).toBe(500);
    expect(body.message).toBe('Failed to load dashboard data');
  });
});

describe('update handlers', () => {
  const putEvent = (pathParameters: Record<string, string>, payload: unknown) =>
    makeEvent({ httpMethod: 'PUT', pathParameters, body: JSON.stringify(payload) });

  it('updateCompany stores only known fields', async () => {
    const { companyId, createdAt } = await repos.leagueOps.companies.create({ name: 'AEW' });

    const { statusCode } = await call(
      updateCompany,
      putEvent({ companyId }, { name: 'TNA', companyId: 'other', createdAt: 'never', extra: 1 }),
    );

    expect(statusCode).toBe(200);
    const stored = await repos.leagueOps.companies.findById(companyId);
    expect(stored).toMatchObject({ companyId, name: 'TNA', createdAt });
    expect(stored).not.toHaveProperty('extra');
  });

  it('updateCompany rejects a body with no known fields', async () => {
    const { companyId } = await repos.leagueOps.companies.create({ name: 'AEW' });

    const { statusCode } = await call(updateCompany, putEvent({ companyId }, { extra: 1 }));

    expect(statusCode).toBe(400);
  });

  it('updateCompany 404s an unknown company', async () => {
    const { statusCode } = await call(
      updateCompany,
      putEvent({ companyId: 'missing' }, { name: 'TNA' }),
    );

    expect(statusCode).toBe(404);
  });

  it('updateShow stores only known fields', async () => {
    const company = await repos.leagueOps.companies.create({ name: 'AEW' });
    const { showId, createdAt } = await repos.leagueOps.shows.create({
      name: 'Raw',
      companyId: company.companyId,
    });

    const { statusCode } = await call(
      updateShow,
      putEvent({ showId }, { name: 'Dynamite', showId: 'other', createdAt: 'never', extra: 1 }),
    );

    expect(statusCode).toBe(200);
    const stored = await repos.leagueOps.shows.findById(showId);
    expect(stored).toMatchObject({ showId, name: 'Dynamite', createdAt });
    expect(stored).not.toHaveProperty('extra');
  });

  it('updateShow rejects a body with no known fields', async () => {
    const company = await repos.leagueOps.companies.create({ name: 'AEW' });
    const { showId } = await repos.leagueOps.shows.create({
      name: 'Raw',
      companyId: company.companyId,
    });

    const { statusCode } = await call(updateShow, putEvent({ showId }, { extra: 1 }));

    expect(statusCode).toBe(400);
  });

  it('updateShow still checks the new company exists', async () => {
    const company = await repos.leagueOps.companies.create({ name: 'AEW' });
    const { showId } = await repos.leagueOps.shows.create({
      name: 'Raw',
      companyId: company.companyId,
    });

    const { statusCode } = await call(updateShow, putEvent({ showId }, { companyId: 'missing' }));

    expect(statusCode).toBe(404);
  });

  it('updateSeason rejects an unknown status', async () => {
    const { seasonId } = await repos.season.seasons.create({
      name: 'S1',
      startDate: '2026-01-01T00:00:00.000Z',
    });

    const { statusCode } = await call(updateSeason, putEvent({ seasonId }, { status: 'paused' }));

    expect(statusCode).toBe(400);
    expect((await repos.season.seasons.findById(seasonId))?.status).toBe('active');
  });

  it('updateSeason still accepts a valid status', async () => {
    const { seasonId } = await repos.season.seasons.create({
      name: 'S1',
      startDate: '2026-01-01T00:00:00.000Z',
    });

    const { statusCode } = await call(
      updateSeason,
      putEvent({ seasonId }, { status: 'completed' }),
    );

    expect(statusCode).toBe(200);
  });
});
