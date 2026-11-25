import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
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
import {
  CORE_STATS,
  DEVELOPMENTAL_BUDGET,
  NO_DIVISION_BUDGET,
  RULES_VERSION,
  SIM_CATEGORIES,
  STAT_BASE,
  STAT_COST_BANDS,
  STYLE_BEATS,
  STYLE_IDS,
  STYLE_SPECIALTIES,
  TIER_BUDGETS,
} from '../../../lib/policies/buildRules';
import { defaultBuild } from '../../../lib/policies/wrestlerBuild';
import type { PlayerBuildView } from '../../../lib/builds/playerBuild';
import type { BuildRulesView } from '../../../lib/builds/buildRulesView';
import type { BuildValidationError } from '../../../lib/policies/wrestlerBuild';
import type { WrestlerMove } from '../../../lib/repositories/types';
import { handler as playersRouter } from '../handler';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';

const OWNER = bearer('owner-sub', 'Wrestler');
const OTHER = bearer('other-sub', 'Wrestler');
const ADMIN = bearer('admin-sub', 'Admin');
const MODERATOR = bearer('mod-sub', 'Moderator');

type Auth = Pick<APIGatewayProxyEvent, 'headers'>;
type ErrorBody = { message: string; errors: BuildValidationError[] };

let repos: Repositories;
let playerId: string;

/** Costs 65: strikes 60 (20) + grapple 75 (35) + endurance 50 (10). */
const MID_STATS = { strikes: 60, grapple: 75, agility: 40, endurance: 50 };

function getBuild(id: string, auth: Auth | null = null) {
  return call<PlayerBuildView & { message?: string }>(playersRouter, makeEvent({
    ...(auth ?? {}),
    httpMethod: 'GET',
    resource: '/players/{playerId}/build',
    path: `/players/${id}/build`,
    pathParameters: { playerId: id },
  }));
}

function putOwnBuild(auth: Auth, body: unknown) {
  return call<PlayerBuildView & ErrorBody>(playersRouter, makeEvent({
    ...auth,
    httpMethod: 'PUT',
    resource: '/players/me/build',
    path: '/players/me/build',
    body: JSON.stringify(body),
  }));
}

function putPlayerBuild(auth: Auth, id: string, body: unknown) {
  return call<PlayerBuildView & ErrorBody>(playersRouter, makeEvent({
    ...auth,
    httpMethod: 'PUT',
    resource: '/players/{playerId}/build',
    path: `/players/${id}/build`,
    pathParameters: { playerId: id },
    body: JSON.stringify(body),
  }));
}

function putOwnProfile(auth: Auth, body: unknown) {
  return call<{ signatures?: WrestlerMove[]; finishers?: WrestlerMove[] }>(playersRouter, makeEvent({
    ...auth,
    httpMethod: 'PUT',
    resource: '/players/me',
    path: '/players/me',
    body: JSON.stringify(body),
  }));
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  const player = await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock' });
  playerId = player.playerId;
  await repos.roster.players.update(playerId, {
    userId: 'owner-sub',
    signatures: [{ gameName: 'Spinebuster', customName: '' }, { gameName: 'Samoan Drop', customName: '' }],
    finishers: [{ gameName: 'Rock Bottom', customName: '' }],
  });
  const other = await repos.roster.players.create({ name: 'Austin', currentWrestler: 'Stone Cold' });
  await repos.roster.players.update(other.playerId, { userId: 'other-sub' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('GET /players/{playerId}/build (BLD-03)', () => {
  it('returns the default build for a player who never saved one, to anyone', async () => {
    const { statusCode, body } = await getBuild(playerId);

    expect(statusCode).toBe(200);
    expect(body.isDefault).toBe(true);
    expect(body.build).toEqual(defaultBuild());
    expect(body.budget).toEqual({ cost: 0, budget: NO_DIVISION_BUDGET, remaining: NO_DIVISION_BUDGET, overBudget: false });
    expect(body.moves.signatures).toEqual([
      { gameName: 'Spinebuster', customName: '', level: 1 },
      { gameName: 'Samoan Drop', customName: '', level: 1 },
    ]);
    expect(body.effective.style).toBe('allRounder');
    expect(body.rulesVersion).toBe(RULES_VERSION);
  });

  it('404s for an unknown player', async () => {
    expect((await getBuild('nope')).statusCode).toBe(404);
  });

  it('prices the build against the current division and flags overBudget after a move down', async () => {
    const top = await repos.leagueOps.divisions.create({ name: 'Raw', tier: 1 });
    const dev = await repos.leagueOps.divisions.create({ name: 'NXT', isDevelopmental: true });
    await repos.roster.players.update(playerId, { divisionId: top.divisionId });
    const saved = await putOwnBuild(OWNER, { style: 'powerhouse', stats: { ...MID_STATS, grapple: 90 } });
    expect(saved.statusCode).toBe(200);
    expect(saved.body.budget).toMatchObject({ budget: TIER_BUDGETS[1], overBudget: false });

    await repos.roster.players.update(playerId, { divisionId: dev.divisionId });
    const { body } = await getBuild(playerId);

    expect(body.budget.budget).toBe(DEVELOPMENTAL_BUDGET);
    expect(body.budget.overBudget).toBe(true);
    expect(body.effective.scaled).toBe(true);
    expect(body.build.stats.grapple).toBe(90);
  });
});

describe('PUT /players/me/build (BLD-03)', () => {
  it('lets the owner save their build and move levels', async () => {
    const { statusCode, body } = await putOwnBuild(OWNER, {
      style: 'powerhouse',
      specialty: 'cage',
      stats: MID_STATS,
      moveLevels: { signatures: [2, 1], finishers: [1] },
    });

    expect(statusCode).toBe(200);
    expect(body.isDefault).toBe(false);
    expect(body.build).toMatchObject({ style: 'powerhouse', specialty: 'cage', stats: MID_STATS });
    expect(body.budget).toMatchObject({ cost: 70, budget: NO_DIVISION_BUDGET, overBudget: false });
    expect(body.moves.signatures.map((move) => move.level)).toEqual([2, 1]);

    const stored = await repos.roster.players.findById(playerId);
    expect(stored?.build?.updatedAt).toBeTruthy();
    // Level 1 is stored without the field.
    expect(stored?.signatures).toEqual([
      { gameName: 'Spinebuster', customName: '', level: 2 },
      { gameName: 'Samoan Drop', customName: '' },
    ]);
  });

  it('keeps current move levels when moveLevels is left out', async () => {
    await putOwnBuild(OWNER, { style: 'brawler', stats: MID_STATS, moveLevels: { finishers: [2] } });

    const { body } = await putOwnBuild(OWNER, { style: 'striker', stats: MID_STATS });

    expect(body.moves.finishers[0].level).toBe(2);
    expect(body.build.style).toBe('striker');
  });

  it('rejects an over-budget build with the cost and budget in the details', async () => {
    const { statusCode, body } = await putOwnBuild(OWNER, {
      style: 'technician',
      stats: { strikes: 100, grapple: 40, agility: 40, endurance: 40 },
    });

    expect(statusCode).toBe(400);
    const overBudget = body.errors.find((buildError) => buildError.code === 'OVER_BUDGET');
    expect(overBudget?.details).toEqual({ cost: 95, budget: NO_DIVISION_BUDGET });
    expect((await repos.roster.players.findById(playerId))?.build).toBeUndefined();
  });

  it('rejects a specialty the style does not allow, naming the allowed ones', async () => {
    const { statusCode, body } = await putOwnBuild(OWNER, {
      style: 'powerhouse',
      specialty: 'highRisk',
      stats: MID_STATS,
    });

    expect(statusCode).toBe(400);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatchObject({
      code: 'SPECIALTY_NOT_ALLOWED',
      details: { style: 'powerhouse', allowed: ['hardcore', 'cage'] },
    });
  });

  it('returns every error at once', async () => {
    const { statusCode, body } = await putOwnBuild(OWNER, {
      style: 'giant',
      stats: { strikes: 'high', grapple: 40, agility: 40, endurance: 40 },
      moveLevels: { signatures: [6, 1], finishers: [1, 1] },
    });

    expect(statusCode).toBe(400);
    expect(body.errors.map((buildError) => buildError.code).sort()).toEqual(
      ['INVALID_MOVE_LEVEL', 'INVALID_MOVE_LEVEL', 'INVALID_STAT', 'INVALID_STYLE'],
    );
    expect(body.errors.map((buildError) => buildError.field)).toContain('moveLevels.finishers');
  });

  it('403s a caller without the Wrestler role', async () => {
    const { statusCode } = await putOwnBuild(bearer('owner-sub', ''), { style: 'brawler', stats: MID_STATS });
    expect(statusCode).toBe(403);
  });
});

describe('PUT /players/{playerId}/build (BLD-03)', () => {
  const body = { style: 'highFlyer', specialty: 'highRisk', stats: MID_STATS };

  it('403s another Wrestler, even the owner', async () => {
    expect((await putPlayerBuild(OTHER, playerId, body)).statusCode).toBe(403);
    expect((await putPlayerBuild(OWNER, playerId, body)).statusCode).toBe(403);
    expect((await repos.roster.players.findById(playerId))?.build).toBeUndefined();
  });

  it("lets an Admin or Moderator save anyone's build", async () => {
    const asAdmin = await putPlayerBuild(ADMIN, playerId, body);
    expect(asAdmin.statusCode).toBe(200);
    expect(asAdmin.body.build).toMatchObject({ style: 'highFlyer', specialty: 'highRisk' });

    const asModerator = await putPlayerBuild(MODERATOR, playerId, { ...body, specialty: null });
    expect(asModerator.statusCode).toBe(200);
    expect(asModerator.body.build.specialty).toBeUndefined();
  });

  it('404s an unknown player', async () => {
    expect((await putPlayerBuild(ADMIN, 'nope', body)).statusCode).toBe(404);
  });
});

describe('moveset edit through PUT /players/me (BLD-03)', () => {
  it('keeps levels for moves that remain, starts new ones at 1 and ignores sent levels', async () => {
    await putOwnBuild(OWNER, { style: 'brawler', stats: MID_STATS, moveLevels: { signatures: [3, 1], finishers: [1] } });

    const { statusCode, body } = await putOwnProfile(OWNER, {
      signatures: [
        { gameName: 'Samoan Drop', customName: '', level: 5 },
        { gameName: 'Spinebuster', customName: 'The Buster' },
        { gameName: 'Sharpshooter', customName: '' },
      ],
    });

    expect(statusCode).toBe(200);
    expect(body.signatures).toEqual([
      { gameName: 'Samoan Drop', customName: '' },
      { gameName: 'Spinebuster', customName: 'The Buster', level: 3 },
      { gameName: 'Sharpshooter', customName: '' },
    ]);
  });

  it('refunds the cost of a removed move without blocking the edit', async () => {
    await putOwnBuild(OWNER, { style: 'brawler', stats: MID_STATS, moveLevels: { signatures: [3, 1], finishers: [1] } });
    expect((await getBuild(playerId)).body.budget.cost).toBe(75);

    const { statusCode } = await putOwnProfile(OWNER, { signatures: [{ gameName: 'Samoan Drop' }] });

    expect(statusCode).toBe(200);
    expect((await getBuild(playerId)).body.budget.cost).toBe(65);
  });

  it('still saves when the build is already over budget, and the read shows it', async () => {
    const top = await repos.leagueOps.divisions.create({ name: 'Raw', tier: 1 });
    await repos.roster.players.update(playerId, { divisionId: top.divisionId });
    await putOwnBuild(OWNER, { style: 'brawler', stats: MID_STATS, moveLevels: { signatures: [5, 5], finishers: [1] } });
    const dev = await repos.leagueOps.divisions.create({ name: 'NXT', isDevelopmental: true });
    await repos.roster.players.update(playerId, { divisionId: dev.divisionId });

    const { statusCode } = await putOwnProfile(OWNER, { bio: 'Changed', finishers: [{ gameName: 'People\'s Elbow' }] });

    expect(statusCode).toBe(200);
    expect((await getBuild(playerId)).body.budget.overBudget).toBe(true);
  });
});

describe('GET /builds/rules (BLD-03)', () => {
  it('serves the values from buildRules.ts', async () => {
    const { statusCode, body } = await call<BuildRulesView>(playersRouter, makeEvent({
      httpMethod: 'GET',
      resource: '/builds/rules',
      path: '/builds/rules',
    }));

    expect(statusCode).toBe(200);
    expect(body.rulesVersion).toBe(RULES_VERSION);
    expect(body.stats).toMatchObject({ coreStats: [...CORE_STATS], base: STAT_BASE });
    expect(body.stats.costBands).toEqual(STAT_COST_BANDS);
    expect(body.budgets.tiers).toEqual({ '1': TIER_BUDGETS[1], '2': TIER_BUDGETS[2] });
    expect(body.budgets.developmental).toBe(DEVELOPMENTAL_BUDGET);
    expect(body.styles.map((style) => style.id)).toEqual([...STYLE_IDS]);
    expect(body.styleBeats).toEqual(STYLE_BEATS);
    expect(body.styleSpecialties).toEqual(STYLE_SPECIALTIES);
    expect(body.simCategories.map((category) => category.id)).toEqual([...SIM_CATEGORIES]);

    const powerhouse = body.styles.find((style) => style.id === 'powerhouse');
    expect(powerhouse).toMatchObject({ beats: 'highFlyer', beatenBy: 'striker', statBonuses: { grapple: 8 } });
    const allRounder = body.styles.find((style) => style.id === 'allRounder');
    expect(allRounder).toMatchObject({ beats: null, beatenBy: null });
  });
});
