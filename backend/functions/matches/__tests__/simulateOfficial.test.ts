import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

vi.mock('../../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('../../__tests__/visibilityTestHelpers');
  return {
    authenticate: async (event: APIGatewayProxyEvent) =>
      event.headers.Authorization ? fakeAuthenticate(event) : { ok: false },
  };
});
vi.mock('../../../lib/asyncLambda', () => ({ invokeAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../lib/progression/trigger', () => ({
  triggerProgressionRecompute: vi.fn().mockResolvedValue(undefined),
}));
// The real service runs; the spy lets tests assert what the handler sent it.
vi.mock('../../../lib/services/recordMatchResult', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/services/recordMatchResult')>();
  return { ...actual, recordMatchResult: vi.fn(actual.recordMatchResult) };
});

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { Match, MatchSimulation } from '../../../lib/repositories/types';
import { recordMatchResult } from '../../../lib/services/recordMatchResult';
import { loadSimInputs, simSidesFromMatch } from '../../../lib/sim/loadSimInputs';
import { simulate } from '../../../lib/policies/matchSim';
import { RULES_VERSION } from '../../../lib/policies/buildRules';
import { handler as matchesRouter } from '../handler';
import { bearer, call, makeEvent } from '../../__tests__/visibilityTestHelpers';
import { NOT_SCHEDULED_MESSAGE, splitResult, type SimulateOfficialResponse } from '../simulateMatch';

type Auth = Pick<APIGatewayProxyEvent, 'headers'>;
const ADMIN: Auth = bearer('admin-sub', 'Admin');
const MODERATOR: Auth = bearer('mod-sub', 'Moderator');
const WRESTLER: Auth = bearer('wrestler-sub', 'Wrestler');
const FANTASY: Auth = bearer('fantasy-sub', 'Fantasy');
const NO_TOKEN: Auth = { headers: {} };

const MATCH_ID = 'match-1';
const MATCH_DATE = '2026-11-30T20:00:00.000Z';

let repos: Repositories;
let rockId: string;
let austinId: string;
let mankindId: string;

const officialRequest = (body: unknown, auth: Auth = MODERATOR, matchId = MATCH_ID) =>
  call<SimulateOfficialResponse & { message?: string }>(matchesRouter, makeEvent({
    ...auth,
    httpMethod: 'POST',
    resource: '/matches/{matchId}/simulate',
    path: `/matches/${matchId}/simulate`,
    pathParameters: { matchId },
    body: JSON.stringify(body),
  }));

const getMatchesRequest = (auth: Auth) =>
  call<Array<Match & Record<string, unknown>>>(matchesRouter, makeEvent({
    ...auth,
    httpMethod: 'GET',
    resource: '/matches',
    path: '/matches',
  }));

async function addPlayer(name: string): Promise<string> {
  return (await repos.roster.players.create({ name, currentWrestler: name })).playerId;
}

async function createMatch(fields: Record<string, unknown> = {}): Promise<void> {
  await repos.competition.matches.create({
    matchId: MATCH_ID,
    date: MATCH_DATE,
    participants: [rockId, austinId],
    status: 'scheduled',
    ...fields,
  });
}

async function storedMatch(): Promise<Match> {
  const match = await repos.competition.matches.findById(MATCH_ID);
  if (!match) throw new Error('match missing');
  return match;
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  rockId = await addPlayer('The Rock');
  austinId = await addPlayer('Stone Cold');
  mankindId = await addPlayer('Mankind');
  await repos.roster.players.update(rockId, {
    finishers: [{ gameName: 'Rock Bottom', customName: '', level: 5 }],
  });
  vi.mocked(recordMatchResult).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('POST /matches/{matchId}/simulate access', () => {
  beforeEach(() => createMatch());

  it('rejects a caller with no token (401)', async () => {
    expect((await officialRequest({ commit: true }, NO_TOKEN)).statusCode).toBe(401);
  });

  it('rejects Wrestler and Fantasy callers (403) and leaves the match scheduled', async () => {
    expect((await officialRequest({ commit: true }, WRESTLER)).statusCode).toBe(403);
    expect((await officialRequest({ commit: true }, FANTASY)).statusCode).toBe(403);
    expect((await storedMatch()).status).toBe('scheduled');
    expect(recordMatchResult).not.toHaveBeenCalled();
  });

  it('allows Admin', async () => {
    expect((await officialRequest({ commit: true }, ADMIN)).statusCode).toBe(200);
  });
});

describe('POST /matches/{matchId}/simulate validation', () => {
  it('returns 409 for a completed match', async () => {
    await createMatch({ status: 'completed', winners: [rockId], losers: [austinId] });
    const { statusCode, body } = await officialRequest({ commit: true });
    expect(statusCode).toBe(409);
    expect(body.message).toBe(NOT_SCHEDULED_MESSAGE);
    expect(recordMatchResult).not.toHaveBeenCalled();
  });

  it('returns 409 for a match with open signups', async () => {
    await createMatch({ status: 'open-signups' });
    expect((await officialRequest({ commit: true })).statusCode).toBe(409);
  });

  it('returns 404 for an unknown match', async () => {
    expect((await officialRequest({ commit: true }, MODERATOR, 'nope')).statusCode).toBe(404);
  });

  it.each([
    ['no commit flag', {}],
    ['commit false', { commit: false }],
    ['a chosen seed', { commit: true, seed: 5 }],
  ])('rejects %s (400)', async (_label, request) => {
    await createMatch();
    expect((await officialRequest(request)).statusCode).toBe(400);
    expect((await storedMatch()).status).toBe('scheduled');
  });
});

describe('POST /matches/{matchId}/simulate success', () => {
  it('records the sim result through the service and stores the simulation', async () => {
    await createMatch({
      participants: [rockId, mankindId, austinId],
      teams: [[rockId, mankindId], [austinId]],
    });

    const { statusCode, body } = await officialRequest({ commit: true });
    expect(statusCode).toBe(200);

    const sim = body.simulation;
    const { winners, losers } = splitResult(sim.probabilities, sim.winnerSideId);
    expect(winners.length).toBeGreaterThan(0);
    expect([...winners, ...losers].sort()).toEqual([rockId, mankindId, austinId].sort());

    expect(recordMatchResult).toHaveBeenCalledTimes(1);
    expect(recordMatchResult).toHaveBeenCalledWith(
      {
        matchId: MATCH_ID,
        winners,
        losers,
        extraMatchFields: {
          resultSource: 'simulation',
          simulation: expect.objectContaining({
            seed: sim.seed,
            probabilities: sim.probabilities,
            playByPlay: sim.playByPlay,
            rulesVersion: RULES_VERSION,
            inputsDigest: sim.inputsDigest,
            simulatedBy: 'mod-sub',
          }),
        },
      },
      { source: 'sim' },
    );

    const match = await storedMatch();
    expect(match.status).toBe('completed');
    expect(match.winners).toEqual(winners);
    expect(match.losers).toEqual(losers);
    expect(match.resultSource).toBe('simulation');
    expect(match.simulation?.seed).toBe(sim.seed);
    expect(match.simulation?.winnerSideId).toBe(sim.winnerSideId);
    expect(match.simulation?.probabilities).toEqual(sim.probabilities);
    expect(match.simulation?.playByPlay.length).toBeGreaterThan(0);
    expect(body.match.resultSource).toBe('simulation');

    for (const playerId of winners) {
      expect((await repos.roster.players.findById(playerId))?.wins).toBe(1);
    }
    for (const playerId of losers) {
      expect((await repos.roster.players.findById(playerId))?.losses).toBe(1);
    }
  });

  it('stores a seed that replays to the same winner', async () => {
    await createMatch();
    const inputsBefore = await loadSimInputs({ sides: simSidesFromMatch(await storedMatch()) });
    if (!inputsBefore.ok) throw new Error('inputs missing');

    expect((await officialRequest({ commit: true })).statusCode).toBe(200);
    const stored = (await storedMatch()).simulation as MatchSimulation;

    const replay = simulate(inputsBefore.inputs.sides, { category: stored.category, seed: stored.seed });
    expect(replay.winnerSideId).toBe(stored.winnerSideId);
    expect(replay.inputsDigest).toBe(stored.inputsDigest);
    expect(replay.rulesVersion).toBe(stored.rulesVersion);
  });

  it('lets only one of two concurrent calls record the result', async () => {
    await createMatch();
    const results = await Promise.all([officialRequest({ commit: true }), officialRequest({ commit: true })]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    expect((await repos.roster.players.findById(rockId))?.wins ?? 0)
      .toBe((await storedMatch()).winners?.includes(rockId) ? 1 : 0);
  });
});

describe('GET /matches with an official sim', () => {
  beforeEach(async () => {
    await createMatch();
    expect((await officialRequest({ commit: true })).statusCode).toBe(200);
  });

  it('shows the public the result source and story but not the odds', async () => {
    for (const auth of [NO_TOKEN, WRESTLER]) {
      const { body } = await getMatchesRequest(auth);
      const match = body.find((entry) => entry.matchId === MATCH_ID);
      expect(match?.resultSource).toBe('simulation');
      const simulation = match?.simulation as unknown as Record<string, unknown>;
      expect(simulation.playByPlay).toBeDefined();
      expect(simulation.seed).toBeDefined();
      expect(simulation).not.toHaveProperty('probabilities');
      expect(simulation).not.toHaveProperty('inputsDigest');
      expect(simulation).not.toHaveProperty('simulatedBy');
    }
  });

  it('shows staff the stored odds', async () => {
    const { body } = await getMatchesRequest(MODERATOR);
    const match = body.find((entry) => entry.matchId === MATCH_ID);
    expect((match?.simulation as MatchSimulation).probabilities).toHaveLength(2);
  });
});

// ECO-10
describe('POST /matches/{matchId}/simulate with a bought sim boost', () => {
  beforeEach(async () => {
    await createMatch({
      simBoosts: [{ playerId: rockId, boost: 5, purchasedAt: '2026-11-24T00:00:00.000Z', purchaseKey: 'k1' }],
    });
  });

  it('uses the boost, records who it boosted and adds a run-in for staff only', async () => {
    const { statusCode, body } = await officialRequest({ commit: true });
    expect(statusCode).toBe(200);
    expect(body.simulation.boosts).toEqual([{ playerId: rockId, boost: 5, multiplier: 1.05 }]);

    const stored = await storedMatch();
    expect(stored.simulation?.simBoostedPlayerIds).toEqual([rockId]);
    expect(stored.simBoosts).toHaveLength(1);
    const runIns = stored.simulation!.playByPlay.filter((beat) => beat.key.startsWith('sim.beats.runIn.'));
    expect(runIns).toHaveLength(1);
    expect(runIns[0].params.wrestler).toBe('The Rock');

    const publicMatch = (await getMatchesRequest(NO_TOKEN)).body.find((entry) => entry.matchId === MATCH_ID);
    const publicBeats = (publicMatch?.simulation as unknown as MatchSimulation).playByPlay;
    expect(publicBeats.some((beat) => beat.key.startsWith('sim.beats.runIn.'))).toBe(false);
    expect(publicMatch?.simulation).not.toHaveProperty('simBoostedPlayerIds');
  });
});
