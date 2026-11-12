import { describe, it, expect, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';

import { handler as getChampionships } from '../getChampionships';
import { handler as getChampionshipHistory } from '../getChampionshipHistory';
import { handler as updateChampionship } from '../updateChampionship';
import { handler as vacateChampionship } from '../vacateChampionship';
import { handler as assignChampion } from '../assignChampion';

// TTC-10: tag title reigns link to the tag team that holds them.

let repos: Repositories;
const ctx = {} as Context;
const cb: Callback = () => {};

function ev(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}
const body = (r: unknown) => JSON.parse((r as { body: string }).body);

const now = () => new Date().toISOString();
const champStore = () =>
  (repos.competition as unknown as { championshipsStore: Map<string, Record<string, unknown>> }).championshipsStore;
const historyStore = () =>
  (repos.competition as unknown as { historyStore: Record<string, unknown>[] }).historyStore;
const tagTeamsStore = () =>
  (repos.roster as unknown as { tagTeamsStore: Map<string, Record<string, unknown>> }).tagTeamsStore;

function seedPlayers(...playerIds: string[]) {
  const playersStore = (repos.roster as unknown as { playersStore: Map<string, Record<string, unknown>> }).playersStore;
  for (const playerId of playerIds) {
    playersStore.set(playerId, { playerId, name: `Player ${playerId}` });
  }
}

function seedTeam(tagTeamId: string, player1Id: string, player2Id: string, extra: Record<string, unknown> = {}) {
  tagTeamsStore().set(tagTeamId, {
    tagTeamId, name: `Team ${tagTeamId}`, player1Id, player2Id, status: 'active',
    wins: 0, losses: 0, draws: 0, createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z',
    ...extra,
  });
}

function seedTagTitle(extra: Record<string, unknown> = {}) {
  champStore().set('c1', {
    championshipId: 'c1', name: 'Tag Titles', type: 'tag', isActive: true, createdAt: now(), ...extra,
  });
}

const assign = (payload: Record<string, unknown>) => assignChampion(ev({
  pathParameters: { championshipId: 'c1' },
  body: JSON.stringify(payload),
}), ctx, cb);

const openReign = () => historyStore().find((h) => h.championshipId === 'c1' && h.lostDate === undefined);

beforeEach(() => {
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

describe('assignChampion — tag teams', () => {
  it('auto-resolves the team from the two champions', async () => {
    seedPlayers('p1', 'p2');
    seedTeam('tt1', 'p2', 'p1');
    seedTagTitle();

    const r = await assign({ champion: ['p1', 'p2'] });
    expect(r!.statusCode).toBe(200);
    expect(body(r).currentTagTeamId).toBe('tt1');
    expect(openReign()!.tagTeamId).toBe('tt1');
  });

  it('leaves the fields unset for a random pairing', async () => {
    seedPlayers('p1', 'p2');
    seedTagTitle();

    const r = await assign({ champion: ['p1', 'p2'] });
    expect(r!.statusCode).toBe(200);
    expect(body(r).currentTagTeamId).toBeUndefined();
    expect(openReign()).not.toHaveProperty('tagTeamId');
  });

  it('crowns a team from tagTeamId alone', async () => {
    seedPlayers('p1', 'p2');
    seedTeam('tt1', 'p1', 'p2');
    seedTagTitle();

    const r = await assign({ tagTeamId: 'tt1' });
    expect(r!.statusCode).toBe(200);
    expect(body(r).currentChampion).toEqual(['p1', 'p2']);
    expect(body(r).currentTagTeamId).toBe('tt1');
    expect(openReign()!.tagTeamId).toBe('tt1');
  });

  it('accepts tagTeamId with matching champions in any order', async () => {
    seedPlayers('p1', 'p2');
    seedTeam('tt1', 'p1', 'p2');
    seedTagTitle();

    const r = await assign({ champion: ['p2', 'p1'], tagTeamId: 'tt1' });
    expect(r!.statusCode).toBe(200);
    expect(body(r).currentTagTeamId).toBe('tt1');
  });

  it('rejects champions that are not the team', async () => {
    seedPlayers('p1', 'p2', 'p3');
    seedTeam('tt1', 'p1', 'p2');
    seedTagTitle();

    const r = await assign({ champion: ['p1', 'p3'], tagTeamId: 'tt1' });
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('champion must be the two members of the tag team');
  });

  it('rejects an unknown tag team', async () => {
    seedTagTitle();
    const r = await assign({ tagTeamId: 'missing' });
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Tag team not found: missing');
  });

  it('rejects a dissolved tag team', async () => {
    seedTeam('tt1', 'p1', 'p2', { status: 'dissolved', dissolvedAt: '2021-01-01T00:00:00Z' });
    seedTagTitle();
    const r = await assign({ tagTeamId: 'tt1' });
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Only an active tag team can be crowned');
  });

  it('rejects tagTeamId on a singles title', async () => {
    seedTeam('tt1', 'p1', 'p2');
    champStore().set('c1', { championshipId: 'c1', name: 'World', type: 'singles', isActive: true, createdAt: now() });
    const r = await assign({ champion: 'p1', tagTeamId: 'tt1' });
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('tagTeamId can only be set on a tag championship');
  });

  it('rejects a non-string tagTeamId', async () => {
    seedTagTitle();
    const r = await assign({ champion: ['p1', 'p2'], tagTeamId: 42 });
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('tagTeamId must be a non-empty string');
  });

  it('still requires a champion when no tagTeamId is given', async () => {
    seedTagTitle();
    const r = await assign({});
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('champion is required (player ID or array of player IDs)');
  });

  it('clears currentTagTeamId when a random pairing takes the title from a team', async () => {
    seedPlayers('p1', 'p2', 'p3', 'p4');
    seedTagTitle({ currentChampion: ['p1', 'p2'], currentTagTeamId: 'tt1' });
    historyStore().push({ championshipId: 'c1', wonDate: '2024-01-01', champion: ['p1', 'p2'], tagTeamId: 'tt1' });

    const r = await assign({ champion: ['p3', 'p4'] });
    expect(r!.statusCode).toBe(200);
    expect(body(r).currentTagTeamId).toBeUndefined();
    expect(champStore().get('c1')).not.toHaveProperty('currentTagTeamId');
  });
});

describe('other championship paths — tag teams', () => {
  it('vacateChampionship clears currentTagTeamId', async () => {
    seedTagTitle({ currentChampion: ['p1', 'p2'], currentTagTeamId: 'tt1' });
    historyStore().push({ championshipId: 'c1', wonDate: '2024-01-01', champion: ['p1', 'p2'], tagTeamId: 'tt1' });

    const r = await vacateChampionship(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(champStore().get('c1')).not.toHaveProperty('currentTagTeamId');
    expect(champStore().get('c1')).not.toHaveProperty('currentChampion');
  });

  it('updateChampionship relinks the team when the champions change', async () => {
    seedPlayers('p1', 'p2', 'p3', 'p4');
    seedTeam('tt2', 'p3', 'p4');
    seedTagTitle({ currentChampion: ['p1', 'p2'], currentTagTeamId: 'tt1' });

    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ currentChampion: ['p3', 'p4'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r).currentTagTeamId).toBe('tt2');
  });

  it('updateChampionship clears the team when a random pairing is set', async () => {
    seedPlayers('p1', 'p2', 'p3', 'p4');
    seedTagTitle({ currentChampion: ['p1', 'p2'], currentTagTeamId: 'tt1' });

    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ currentChampion: ['p3', 'p4'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r)).not.toHaveProperty('currentTagTeamId');
  });

  it('getChampionships and getChampionshipHistory include the team name', async () => {
    seedTeam('tt1', 'p1', 'p2', { name: 'The Usos' });
    seedTagTitle({ currentChampion: ['p1', 'p2'], currentTagTeamId: 'tt1' });
    historyStore().push({ championshipId: 'c1', wonDate: '2024-01-01', champion: ['p1', 'p2'], tagTeamId: 'tt1' });
    historyStore().push({ championshipId: 'c1', wonDate: '2023-01-01', champion: ['p5', 'p6'], lostDate: '2024-01-01' });

    const list = body(await getChampionships(ev(), ctx, cb));
    expect(list[0].currentTagTeamName).toBe('The Usos');

    const history = body(
      await getChampionshipHistory(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb),
    ) as Record<string, unknown>[];
    expect(history.find((reign) => reign.wonDate === '2024-01-01')!.tagTeamName).toBe('The Usos');
    expect(history.find((reign) => reign.wonDate === '2023-01-01')).not.toHaveProperty('tagTeamName');
  });
});
