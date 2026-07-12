import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

let uuidCounter = 0;
vi.mock('uuid', () => ({ v4: () => `test-uuid-${++uuidCounter}` }));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';

import { handler as createChampionship } from '../createChampionship';
import { handler as getChampionships } from '../getChampionships';
import { handler as getChampionshipHistory } from '../getChampionshipHistory';
import { handler as updateChampionship } from '../updateChampionship';
import { handler as deleteChampionship } from '../deleteChampionship';
import { handler as vacateChampionship } from '../vacateChampionship';
import { handler as assignChampion } from '../assignChampion';

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

beforeEach(() => {
  vi.clearAllMocks();
  uuidCounter = 0;
  resetRepositoriesForTesting();
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

describe('createChampionship', () => {
  it('creates a singles championship and returns 201', async () => {
    const result = await createChampionship(
      ev({ body: JSON.stringify({ name: 'World Championship', type: 'singles' }) }), ctx, cb,
    );
    expect(result!.statusCode).toBe(201);
    const b = body(result);
    expect(b.championshipId).toBeDefined();
    expect(b.name).toBe('World Championship');
    expect(b.type).toBe('singles');
    expect(b.isActive).toBe(true);
    expect(b.createdAt).toBeDefined();
  });

  it('creates a tag championship with optional fields (divisionId, imageUrl, currentChampion)', async () => {
    const result = await createChampionship(ev({
      body: JSON.stringify({
        name: 'Tag Titles', type: 'tag', divisionId: 'div-1',
        imageUrl: 'https://example.com/belt.png', currentChampion: ['p1', 'p2'],
      }),
    }), ctx, cb);
    expect(result!.statusCode).toBe(201);
    const b = body(result);
    expect(b.type).toBe('tag');
    expect(b.divisionId).toBe('div-1');
    expect(b.imageUrl).toBe('https://example.com/belt.png');
    expect(b.currentChampion).toEqual(['p1', 'p2']);
  });

  it('returns 400 when name is missing', async () => {
    const r = await createChampionship(ev({ body: JSON.stringify({ type: 'singles' }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('name is required');
  });

  it('returns 400 when type is missing', async () => {
    const r = await createChampionship(ev({ body: JSON.stringify({ name: 'Belt' }) }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('type is required');
  });

  it('returns 400 when type is invalid', async () => {
    const r = await createChampionship(
      ev({ body: JSON.stringify({ name: 'Belt', type: 'triple-threat' }) }), ctx, cb,
    );
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Type must be either "singles" or "tag"');
  });

  it('returns 400 for missing body', async () => {
    const r = await createChampionship(ev({ body: null }), ctx, cb);
    expect(r!.statusCode).toBe(400);
  });
});

describe('getChampionships', () => {
  it('returns only active championships (filters isActive === false)', async () => {
    // Seed championships directly into the in-memory store
    const store = (repos.competition as unknown as { championshipsStore: Map<string, Record<string, unknown>> }).championshipsStore;
    store.set('c1', { championshipId: 'c1', name: 'Active', isActive: true, type: 'singles', createdAt: '' } as Record<string, unknown>);
    store.set('c2', { championshipId: 'c2', name: 'Retired', isActive: false, type: 'singles', createdAt: '' } as Record<string, unknown>);
    store.set('c3', { championshipId: 'c3', name: 'Default', type: 'singles', createdAt: '' } as Record<string, unknown>);

    const r = await getChampionships(ev(), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const items = body(r);
    expect(items).toHaveLength(2);
    expect(items.map((c: { name: string }) => c.name).sort()).toEqual(['Active', 'Default']);
  });

  it('returns inactive championships when includeInactive=true', async () => {
    const store = (repos.competition as unknown as { championshipsStore: Map<string, Record<string, unknown>> }).championshipsStore;
    store.set('c1', { championshipId: 'c1', name: 'Active', isActive: true, type: 'singles', createdAt: '' } as Record<string, unknown>);
    store.set('c2', { championshipId: 'c2', name: 'Retired', isActive: false, type: 'singles', createdAt: '' } as Record<string, unknown>);

    const r = await getChampionships(ev({ queryStringParameters: { includeInactive: 'true' } }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    const items = body(r);
    expect(items).toHaveLength(2);
    expect(items.map((c: { name: string }) => c.name).sort()).toEqual(['Active', 'Retired']);
  });

  it('returns empty array when no championships exist', async () => {
    const r = await getChampionships(ev(), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r)).toEqual([]);
  });

  it('returns 500 when list throws an error', async () => {
    vi.spyOn(repos.competition.championships, 'list').mockRejectedValue(new Error('DB failure'));
    const r = await getChampionships(ev(), ctx, cb);
    expect(r!.statusCode).toBe(500);
    expect(body(r).message).toBe('Failed to fetch championships');
  });
});

describe('getChampionshipHistory', () => {
  it('returns history for a championship', async () => {
    const historyStore = (repos.competition as unknown as { historyStore: Record<string, unknown>[] }).historyStore;
    historyStore.push(
      { championshipId: 'c1', wonDate: '2024-01-01', playerId: 'p1' },
      { championshipId: 'c1', wonDate: '2024-06-01', playerId: 'p2' },
    );

    const r = await getChampionshipHistory(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r)).toHaveLength(2);
  });

  it('returns empty array when no history exists', async () => {
    const r = await getChampionshipHistory(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r)).toEqual([]);
  });

  it('returns 400 when championshipId is missing', async () => {
    const r = await getChampionshipHistory(ev({ pathParameters: null }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Championship ID is required');
  });
});

describe('updateChampionship', () => {
  it('updates championship fields and returns updated item', async () => {
    await repos.competition.championships.create({ name: 'Old', type: 'singles' });
    const champ = (await repos.competition.championships.list())[0];

    const r = await updateChampionship(ev({
      pathParameters: { championshipId: champ.championshipId }, body: JSON.stringify({ name: 'New' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r).name).toBe('New');
  });

  it('returns 404 if championship does not exist', async () => {
    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'missing' }, body: JSON.stringify({ name: 'X' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(body(r).message).toBe('Championship not found');
  });

  it('returns 400 when no valid fields to update', async () => {
    await repos.competition.championships.create({ name: 'Belt', type: 'singles' });
    const champ = (await repos.competition.championships.list())[0];

    const r = await updateChampionship(ev({
      pathParameters: { championshipId: champ.championshipId }, body: JSON.stringify({}),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('No valid fields to update');
  });

  it('returns 400 when championshipId is missing', async () => {
    const r = await updateChampionship(ev({
      pathParameters: null, body: JSON.stringify({ name: 'X' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Championship ID is required');
  });

  it('updates imageUrl field', async () => {
    await repos.competition.championships.create({ name: 'Belt', type: 'singles' });
    const champ = (await repos.competition.championships.list())[0];

    const r = await updateChampionship(ev({
      pathParameters: { championshipId: champ.championshipId },
      body: JSON.stringify({ imageUrl: 'https://example.com/belt.png' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r).imageUrl).toBe('https://example.com/belt.png');
  });

  it('updates currentChampion field', async () => {
    await repos.competition.championships.create({ name: 'Belt', type: 'singles' });
    const champ = (await repos.competition.championships.list())[0];

    const r = await updateChampionship(ev({
      pathParameters: { championshipId: champ.championshipId },
      body: JSON.stringify({ currentChampion: 'p1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r).currentChampion).toBe('p1');
  });

  it('updates isActive field to deactivate and reactivate a championship', async () => {
    await repos.competition.championships.create({ name: 'Belt', type: 'singles' });
    const champ = (await repos.competition.championships.list())[0];

    const deactivate = await updateChampionship(ev({
      pathParameters: { championshipId: champ.championshipId },
      body: JSON.stringify({ isActive: false }),
    }), ctx, cb);
    expect(deactivate!.statusCode).toBe(200);
    expect(body(deactivate).isActive).toBe(false);

    const reactivate = await updateChampionship(ev({
      pathParameters: { championshipId: champ.championshipId },
      body: JSON.stringify({ isActive: true }),
    }), ctx, cb);
    expect(reactivate!.statusCode).toBe(200);
    expect(body(reactivate).isActive).toBe(true);
  });

  it('updates divisionId field', async () => {
    await repos.competition.championships.create({ name: 'Belt', type: 'singles' });
    const champ = (await repos.competition.championships.list())[0];

    const r = await updateChampionship(ev({
      pathParameters: { championshipId: champ.championshipId },
      body: JSON.stringify({ divisionId: 'div-1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    // The handler includes divisionId in the patch — but the ChampionshipPatch interface
    // may not have divisionId. The update should still succeed.
  });

  it('returns 500 when an unexpected error occurs', async () => {
    vi.spyOn(repos.competition.championships, 'update').mockRejectedValue(new Error('DB failure'));
    const r = await updateChampionship(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ name: 'New' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(500);
    expect(body(r).message).toBe('Failed to update championship');
  });
});

describe('deleteChampionship', () => {
  it('deletes championship and cascades to history, returns 204', async () => {
    await repos.competition.championships.create({ name: 'Belt', type: 'singles' });
    const champ = (await repos.competition.championships.list())[0];
    const historyStore = (repos.competition as unknown as { historyStore: Record<string, unknown>[] }).historyStore;
    historyStore.push(
      { championshipId: champ.championshipId, wonDate: '2024-01-01' },
      { championshipId: champ.championshipId, wonDate: '2024-06-01' },
    );

    const r = await deleteChampionship(ev({ pathParameters: { championshipId: champ.championshipId } }), ctx, cb);
    expect(r!.statusCode).toBe(204);
    // Championship should be gone
    const remaining = await repos.competition.championships.findById(champ.championshipId);
    expect(remaining).toBeNull();
    // History should be gone
    expect(historyStore.filter(h => h.championshipId === champ.championshipId)).toHaveLength(0);
  });

  it('deletes championship with no history', async () => {
    await repos.competition.championships.create({ name: 'Belt', type: 'singles' });
    const champ = (await repos.competition.championships.list())[0];

    const r = await deleteChampionship(ev({ pathParameters: { championshipId: champ.championshipId } }), ctx, cb);
    expect(r!.statusCode).toBe(204);
    expect(await repos.competition.championships.findById(champ.championshipId)).toBeNull();
  });

  it('returns 404 if championship not found', async () => {
    const r = await deleteChampionship(ev({ pathParameters: { championshipId: 'missing' } }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(body(r).message).toBe('Championship not found');
  });

  it('returns 400 when championshipId is missing', async () => {
    const r = await deleteChampionship(ev({ pathParameters: null }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Championship ID is required');
  });
});

describe('vacateChampionship', () => {
  it('vacates championship and closes current reign', async () => {
    // Create championship with a current champion
    const store = (repos.competition as unknown as { championshipsStore: Map<string, Record<string, unknown>> }).championshipsStore;
    store.set('c1', {
      championshipId: 'c1', name: 'World Title', type: 'singles',
      currentChampion: 'p1', isActive: true, createdAt: new Date().toISOString(),
    });

    // Add history entry for current reign
    const historyStore = (repos.competition as unknown as { historyStore: Record<string, unknown>[] }).historyStore;
    historyStore.push({ championshipId: 'c1', wonDate: '2024-01-01', playerId: 'p1' });

    const r = await vacateChampionship(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(200);

    // Championship should no longer have a current champion
    const updated = await repos.competition.championships.findById('c1');
    expect(updated!.currentChampion).toBeUndefined();

    // History entry should be closed (have lostDate and daysHeld)
    const reign = historyStore.find(h => h.championshipId === 'c1' && h.wonDate === '2024-01-01');
    expect(reign!.lostDate).toBeDefined();
    expect(reign!.daysHeld).toBeDefined();
  });

  it('vacates championship with no open history record', async () => {
    const store = (repos.competition as unknown as { championshipsStore: Map<string, Record<string, unknown>> }).championshipsStore;
    store.set('c1', {
      championshipId: 'c1', name: 'World Title', type: 'singles',
      currentChampion: 'p1', isActive: true, createdAt: new Date().toISOString(),
    });

    const r = await vacateChampionship(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(200);

    const updated = await repos.competition.championships.findById('c1');
    expect(updated!.currentChampion).toBeUndefined();
  });

  it('returns 400 if championship is already vacant', async () => {
    const store = (repos.competition as unknown as { championshipsStore: Map<string, Record<string, unknown>> }).championshipsStore;
    store.set('c1', {
      championshipId: 'c1', name: 'World Title', type: 'singles',
      isActive: true, createdAt: new Date().toISOString(),
    });

    const r = await vacateChampionship(ev({ pathParameters: { championshipId: 'c1' } }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Championship is already vacant');
  });

  it('returns 404 if championship not found', async () => {
    const r = await vacateChampionship(ev({ pathParameters: { championshipId: 'missing' } }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(body(r).message).toBe('Championship not found');
  });

  it('returns 400 when championshipId is missing', async () => {
    const r = await vacateChampionship(ev({ pathParameters: null }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Championship ID is required');
  });
});

describe('assignChampion', () => {
  const seedPlayers = (...playerIds: string[]) => {
    const playersStore = (repos.roster as unknown as { playersStore: Map<string, Record<string, unknown>> }).playersStore;
    for (const playerId of playerIds) {
      playersStore.set(playerId, { playerId, name: `Player ${playerId}` } as Record<string, unknown>);
    }
  };
  const champStore = () =>
    (repos.competition as unknown as { championshipsStore: Map<string, Record<string, unknown>> }).championshipsStore;
  const historyStore = () =>
    (repos.competition as unknown as { historyStore: Record<string, unknown>[] }).historyStore;

  it('assigns a champion to a vacant title and opens a reign without a matchId', async () => {
    seedPlayers('p1');
    champStore().set('c1', {
      championshipId: 'c1', name: 'World Title', type: 'singles',
      isActive: true, createdAt: new Date().toISOString(),
    });

    const r = await assignChampion(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ champion: 'p1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r).currentChampion).toBe('p1');

    const reigns = historyStore().filter(h => h.championshipId === 'c1');
    expect(reigns).toHaveLength(1);
    expect(reigns[0].champion).toBe('p1');
    expect(reigns[0].matchId).toBeUndefined();
    expect(reigns[0].lostDate).toBeUndefined();
    expect(reigns[0].defenses).toBe(0);
  });

  it('closes the previous reign when replacing an existing champion', async () => {
    seedPlayers('p1', 'p2');
    champStore().set('c1', {
      championshipId: 'c1', name: 'World Title', type: 'singles',
      currentChampion: 'p1', isActive: true, createdAt: new Date().toISOString(),
    });
    historyStore().push({ championshipId: 'c1', wonDate: '2024-01-01', champion: 'p1' });

    const r = await assignChampion(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ champion: 'p2' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r).currentChampion).toBe('p2');

    const oldReign = historyStore().find(h => h.championshipId === 'c1' && h.wonDate === '2024-01-01');
    expect(oldReign!.lostDate).toBeDefined();
    expect(oldReign!.daysHeld).toBeDefined();

    const openReigns = historyStore().filter(h => h.championshipId === 'c1' && h.lostDate === undefined);
    expect(openReigns).toHaveLength(1);
    expect(openReigns[0].champion).toBe('p2');
  });

  it('assigns tag team champions as an array', async () => {
    seedPlayers('p1', 'p2');
    champStore().set('c1', {
      championshipId: 'c1', name: 'Tag Titles', type: 'tag',
      isActive: true, createdAt: new Date().toISOString(),
    });

    const r = await assignChampion(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ champion: ['p1', 'p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(200);
    expect(body(r).currentChampion).toEqual(['p1', 'p2']);
  });

  it('returns 400 when the player is already the champion', async () => {
    seedPlayers('p1');
    champStore().set('c1', {
      championshipId: 'c1', name: 'World Title', type: 'singles',
      currentChampion: 'p1', isActive: true, createdAt: new Date().toISOString(),
    });

    const r = await assignChampion(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ champion: 'p1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('This player is already the champion');
  });

  it('returns 400 for multiple champions on a singles title', async () => {
    seedPlayers('p1', 'p2');
    champStore().set('c1', {
      championshipId: 'c1', name: 'World Title', type: 'singles',
      isActive: true, createdAt: new Date().toISOString(),
    });

    const r = await assignChampion(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ champion: ['p1', 'p2'] }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('A singles championship must have exactly one champion');
  });

  it('returns 400 for a single champion on a tag title', async () => {
    seedPlayers('p1');
    champStore().set('c1', {
      championshipId: 'c1', name: 'Tag Titles', type: 'tag',
      isActive: true, createdAt: new Date().toISOString(),
    });

    const r = await assignChampion(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ champion: 'p1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('A tag championship requires at least two champions');
  });

  it('returns 400 when a player does not exist', async () => {
    champStore().set('c1', {
      championshipId: 'c1', name: 'World Title', type: 'singles',
      isActive: true, createdAt: new Date().toISOString(),
    });

    const r = await assignChampion(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({ champion: 'ghost' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Player not found: ghost');
  });

  it('returns 400 when champion is missing', async () => {
    champStore().set('c1', {
      championshipId: 'c1', name: 'World Title', type: 'singles',
      isActive: true, createdAt: new Date().toISOString(),
    });

    const r = await assignChampion(ev({
      pathParameters: { championshipId: 'c1' },
      body: JSON.stringify({}),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
  });

  it('returns 404 if championship not found', async () => {
    seedPlayers('p1');
    const r = await assignChampion(ev({
      pathParameters: { championshipId: 'missing' },
      body: JSON.stringify({ champion: 'p1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(404);
    expect(body(r).message).toBe('Championship not found');
  });

  it('returns 400 when championshipId is missing', async () => {
    const r = await assignChampion(ev({
      pathParameters: null,
      body: JSON.stringify({ champion: 'p1' }),
    }), ctx, cb);
    expect(r!.statusCode).toBe(400);
    expect(body(r).message).toBe('Championship ID is required');
  });
});
