import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// INJ-07: injured-participant flags on match reads, and the staff notice on
// an extension or a storyline injury.

const { createNotification, listStaffUserIds } = vi.hoisted(() => ({
  createNotification: vi.fn(),
  listStaffUserIds: vi.fn(),
}));

vi.mock('../../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('../../__tests__/visibilityTestHelpers');
  return { authenticate: fakeAuthenticate };
});
vi.mock('../../../lib/notifications', () => ({ createNotification }));
vi.mock('../../../lib/staffUsers', () => ({ listStaffUserIds }));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import { resetRepositoriesForTesting, setRepositoriesForTesting, type Repositories } from '../../../lib/repositories';
import { toCurrentInjury, type Injury } from '../../../lib/repositories/injuries';
import type { FeatureFlags } from '../../../lib/repositories/SiteConfigRepository';
import type { InjuredParticipant, EventInjuredParticipant } from '../../../lib/injuries/scheduledMatchFlags';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import { handler as getMatches } from '../../matches/getMatches';
import { handler as getEvent } from '../../events/getEvent';
import { handler as getEvents } from '../../events/getEvents';
import { handler as getDashboard } from '../../dashboard/getDashboard';
import { handler as injuriesRouter } from '../handler';

type FlaggedRow = { matchId: string; injuredParticipants?: InjuredParticipant[] };

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number): string => new Date(Date.now() + days * DAY_MS).toISOString();

let repos: Repositories;
let hurtId: string;
let healthyId: string;
let returnsAt: string;

const setInjuriesFlag = (on: boolean) =>
  repos.user.siteConfig.updateFeatures({ injuries: on } as Partial<FeatureFlags>);

async function createMatch(matchId: string, date: string, status: 'scheduled' | 'completed') {
  await repos.competition.matches.create({
    matchId, date, status, matchFormat: 'singles', participants: [hurtId, healthyId],
  });
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  await setInjuriesFlag(true);
  hurtId = (await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' })).playerId;
  healthyId = (await repos.roster.players.create({ name: 'Steve', currentWrestler: 'Stone Cold' })).playerId;

  const injury: Injury = {
    playerId: hurtId,
    startedAt: inDays(-2),
    injuryId: 'inj-1',
    source: 'match',
    severity: 'moderate',
    weeks: 2,
    returnsAt: inDays(10),
    matchId: 'old-match',
    note: 'GM only',
    changes: [],
  };
  returnsAt = injury.returnsAt;
  await repos.runInTransaction(async (tx) => {
    tx.putInjury(injury);
    tx.updatePlayerCondition(hurtId, { currentInjury: toCurrentInjury(injury), stamina: 20 });
  });

  await createMatch('during', inDays(3), 'scheduled');
  await createMatch('after', inDays(14), 'scheduled');
  await createMatch('done', inDays(1), 'completed');

  createNotification.mockReset();
  listStaffUserIds.mockReset().mockResolvedValue(['admin-sub', 'mod-sub']);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('GET /matches', () => {
  it('flags a scheduled match during the injury, not one after it or a completed one', async () => {
    const { statusCode, body } = await call<FlaggedRow[]>(getMatches, makeEvent());
    expect(statusCode).toBe(200);
    const byId = new Map(body.map((row) => [row.matchId, row]));
    expect(byId.get('during')?.injuredParticipants).toEqual([{ playerId: hurtId, returnsAt }]);
    expect(byId.get('after')?.injuredParticipants).toBeUndefined();
    expect(byId.get('done')?.injuredParticipants).toBeUndefined();
  });

  it('exposes only the return date, never severity, notes or stamina', async () => {
    const { body } = await call<FlaggedRow[]>(getMatches, makeEvent());
    const flag = body.find((row) => row.matchId === 'during')?.injuredParticipants?.[0];
    expect(Object.keys(flag ?? {}).sort()).toEqual(['playerId', 'returnsAt']);
  });

  it('adds no flags while the injuries feature is off', async () => {
    await setInjuriesFlag(false);
    const { body } = await call<FlaggedRow[]>(getMatches, makeEvent());
    expect(body.every((row) => row.injuredParticipants === undefined)).toBe(true);
  });
});

describe('events and dashboard', () => {
  let eventId: string;

  beforeEach(async () => {
    eventId = (await repos.leagueOps.events.create({ name: 'Raw', eventType: 'weekly', date: inDays(3) })).eventId;
    await repos.leagueOps.events.update(eventId, {
      matchCards: [
        { position: 1, matchId: 'during', designation: 'opener' },
        { position: 2, matchId: 'after', designation: 'main-event' },
      ],
    });
  });

  it('GET /events/{eventId} flags the card match during the injury', async () => {
    const { body } = await call<{ enrichedMatches: Array<{ matchId: string; matchData: FlaggedRow | null }> }>(
      getEvent,
      makeEvent({ pathParameters: { eventId } }),
    );
    const byId = new Map(body.enrichedMatches.map((card) => [card.matchId, card.matchData]));
    expect(byId.get('during')?.injuredParticipants).toEqual([{ playerId: hurtId, returnsAt }]);
    expect(byId.get('after')?.injuredParticipants).toBeUndefined();
  });

  it('GET /events lists the injured participants per open event', async () => {
    const { body } = await call<Array<{ eventId: string; injuredParticipants?: EventInjuredParticipant[] }>>(
      getEvents,
      makeEvent(),
    );
    expect(body.find((item) => item.eventId === eventId)?.injuredParticipants).toEqual([
      { playerId: hurtId, returnsAt, matchId: 'during' },
    ]);
  });

  it('the dashboard flags the upcoming event', async () => {
    const { body } = await call<{ upcomingEvents: Array<{ eventId: string; injuredParticipants?: EventInjuredParticipant[] }> }>(
      getDashboard,
      makeEvent(),
    );
    expect(body.upcomingEvents.find((item) => item.eventId === eventId)?.injuredParticipants).toEqual([
      { playerId: hurtId, returnsAt, matchId: 'during' },
    ]);
  });
});

describe('staff notice from GM injury routes', () => {
  const staffNotices = () => createNotification.mock.calls
    .map(([params]) => params as { userId: string; type: string; message: string })
    .filter((params) => params.type === 'injury_staff_notice');

  const patchCurrent = (change: { weeks: number } | { returnsAt: string }) => call(injuriesRouter, makeEvent({
    ...bearer('admin-sub', 'Admin'),
    httpMethod: 'PATCH',
    resource: '/players/{playerId}/injuries/current',
    path: `/players/${hurtId}/injuries/current`,
    pathParameters: { playerId: hurtId },
    body: JSON.stringify(change),
  }));

  it('an extension tells every GM what the injury affects', async () => {
    const { statusCode } = await patchCurrent({ weeks: 4 });
    expect(statusCode).toBe(200);
    const notices = staffNotices();
    expect(notices.map((notice) => notice.userId).sort()).toEqual(['admin-sub', 'mod-sub']);
    // Four weeks from the start now covers both scheduled matches.
    expect(notices[0].message).toMatch(/^The Rock is injured until .+\. Affected: 2 scheduled matches$/);
  });

  it('shortening an injury sends no staff notice', async () => {
    const { statusCode } = await patchCurrent({ returnsAt: inDays(5) });
    expect(statusCode).toBe(200);
    expect(staffNotices()).toEqual([]);
  });

  it('a storyline injury tells every GM', async () => {
    const { statusCode } = await call(injuriesRouter, makeEvent({
      ...bearer('admin-sub', 'Admin'),
      httpMethod: 'POST',
      resource: '/players/{playerId}/injuries',
      path: `/players/${healthyId}/injuries`,
      pathParameters: { playerId: healthyId },
      body: JSON.stringify({ weeks: 1, severity: 'minor' }),
    }));
    expect(statusCode).toBe(201);
    const notices = staffNotices();
    expect(notices).toHaveLength(2);
    expect(notices[0].message).toMatch(/^Stone Cold is injured until /);
  });
});
