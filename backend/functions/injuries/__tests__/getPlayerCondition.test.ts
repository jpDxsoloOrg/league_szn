import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

vi.mock('../../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('../../__tests__/visibilityTestHelpers');
  return { authenticate: fakeAuthenticate };
});

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { toCurrentInjury, type Injury } from '../../../lib/repositories/injuries';
import type { FeatureFlags } from '../../../lib/repositories/SiteConfigRepository';
import { DEFAULT_INJURY_TUNABLES } from '../../../lib/policies/fatigueDefaults';
import { leagueWeekOf } from '../../../lib/leagueWeek';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import { handler as injuriesRouter } from '../handler';
import { staminaBand, type PlayerConditionView } from '../getPlayerCondition';
import { INJURIES_OFF_MESSAGE } from '../shared';

type Auth = Pick<APIGatewayProxyEvent, 'headers'>;
type Body = PlayerConditionView & { message?: string };

const OWNER = bearer('player-sub', 'Wrestler');
const OTHER_WRESTLER = bearer('other-sub', 'Wrestler');
const MODERATOR = bearer('mod-sub', 'Moderator');

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number): string => new Date(Date.now() + days * DAY_MS).toISOString();

const injuriesFlag = (on: boolean): Partial<FeatureFlags> => ({ injuries: on } as unknown as Partial<FeatureFlags>);

let repos: Repositories;
let playerId: string;
let opponentId: string;

function requestCondition(auth: Auth = OWNER) {
  return call<Body>(injuriesRouter, makeEvent({
    ...auth,
    httpMethod: 'GET',
    resource: '/players/{playerId}/condition',
    path: `/players/${playerId}/condition`,
    pathParameters: { playerId },
  }));
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  await repos.user.siteConfig.updateFeatures(injuriesFlag(true));
  playerId = (await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' })).playerId;
  opponentId = (await repos.roster.players.create({ name: 'Austin', currentWrestler: 'Stone Cold' })).playerId;
  await repos.roster.players.update(playerId, { userId: 'player-sub' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('GET /players/{playerId}/condition (INJ-12)', () => {
  it('shows the player full stamina, the next Sunday recovery and no next match by default', async () => {
    const { statusCode, body } = await requestCondition();
    expect(statusCode).toBe(200);
    expect(body.stamina).toBe(DEFAULT_INJURY_TUNABLES.maxStamina);
    expect(body.maxStamina).toBe(DEFAULT_INJURY_TUNABLES.maxStamina);
    expect(body.band).toBe(0);
    expect(body.bandCount).toBe(DEFAULT_INJURY_TUNABLES.injuryChanceBands.length);
    expect(body.currentInjury).toBeNull();
    expect(body.nextMatch).toBeNull();

    const recovery = new Date(body.nextRecoveryAt);
    expect(recovery.getTime()).toBeGreaterThan(Date.now());
    expect(recovery.getTime() - Date.now()).toBeLessThanOrEqual(7 * DAY_MS);
    // A league week boundary: Sunday 00:00 in the league time zone.
    expect(leagueWeekOf(recovery, DEFAULT_INJURY_TUNABLES.timezone).weekStart.getTime()).toBe(recovery.getTime());
  });

  it('gives the drain of the earliest scheduled match the player is booked in', async () => {
    await repos.roster.players.update(playerId, { stamina: 60 } as Record<string, unknown>);
    await repos.competition.matches.create({
      matchId: 'later', date: inDays(9), participants: [playerId, opponentId], status: 'scheduled', matchFormat: 'singles',
    });
    await repos.competition.matches.create({
      matchId: 'sooner', date: inDays(2), participants: [playerId, opponentId], status: 'scheduled', matchFormat: 'singles',
    });
    await repos.competition.matches.create({
      matchId: 'not-mine', date: inDays(1), participants: [opponentId], status: 'scheduled', matchFormat: 'singles',
    });

    const { body } = await requestCondition();
    expect(body.stamina).toBe(60);
    expect(body.nextMatch?.matchId).toBe('sooner');
    expect(body.nextMatch?.drain).toBeGreaterThan(0);
    expect(body.nextMatch?.staminaAfter).toBe(60 - body.nextMatch!.drain);
  });

  it('shows the open injury without its source or GM note', async () => {
    const injury: Injury = {
      playerId,
      startedAt: inDays(-2),
      injuryId: 'inj-1',
      source: 'storyline',
      severity: 'major',
      weeks: 4,
      returnsAt: inDays(20),
      note: 'Staff only',
      changes: [],
    };
    await repos.runInTransaction(async (tx) => {
      tx.putInjury(injury);
      tx.updatePlayerCondition(playerId, { stamina: 10, currentInjury: toCurrentInjury(injury) });
    });

    const { body } = await requestCondition();
    expect(body.currentInjury).toEqual({
      injuryId: 'inj-1',
      startedAt: injury.startedAt,
      returnsAt: injury.returnsAt,
      severity: 'major',
      weeks: 4,
    });
    expect(body.band).toBe(staminaBand(10, DEFAULT_INJURY_TUNABLES));
  });

  it('lets staff read it and refuses another wrestler and an unverified caller', async () => {
    expect((await requestCondition(MODERATOR)).statusCode).toBe(200);
    expect((await requestCondition(OTHER_WRESTLER)).statusCode).toBe(403);
    expect((await requestCondition({ headers: { Authorization: 'Bearer invalid' } })).statusCode).toBe(401);
  });

  it('answers 403 while the injuries feature is off', async () => {
    await repos.user.siteConfig.updateFeatures(injuriesFlag(false));
    const { statusCode, body } = await requestCondition();
    expect(statusCode).toBe(403);
    expect(body.message).toBe(INJURIES_OFF_MESSAGE);
  });
});

describe('staminaBand', () => {
  it('picks the first band whose floor the stamina reaches', () => {
    const tunables = { injuryChanceBands: [{ minStamina: 70, chance: 0.01 }, { minStamina: 40, chance: 0.03 }, { minStamina: 0, chance: 0.1 }] };
    expect(staminaBand(100, tunables)).toBe(0);
    expect(staminaBand(70, tunables)).toBe(0);
    expect(staminaBand(69, tunables)).toBe(1);
    expect(staminaBand(0, tunables)).toBe(2);
  });
});
