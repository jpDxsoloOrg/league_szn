import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Callback } from 'aws-lambda';
import type { Championship, ContenderRanking, Player, TagTeam } from '../../../lib/repositories/types';

// ─── Mocks ───────────────────────────────────────────────────────────

const mockContendersRepo = {
  listByChampionshipRanked: vi.fn(),
};

const mockChampionshipsRepo = {
  findById: vi.fn(),
};

const mockPlayersRepo = {
  findById: vi.fn(),
  findByIdWithDeleted: vi.fn(),
};

const mockTagTeamsRepo = {
  listAll: vi.fn(),
};

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      contenders: mockContendersRepo,
      championships: mockChampionshipsRepo,
    },
    roster: {
      players: mockPlayersRepo,
      tagTeams: mockTagTeamsRepo,
    },
  }),
}));

import { handler as getContenders } from '../getContenders';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(championshipId: string): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
    isBase64Encoded: false, path: `/championships/${championshipId}/contenders`,
    pathParameters: { championshipId },
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '/championships/{championshipId}/contenders',
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
  };
}

async function call(championshipId: string): Promise<APIGatewayProxyResult> {
  const result = await getContenders(makeEvent(championshipId), ctx, cb);
  if (!result) throw new Error('handler returned no result');
  return result;
}

function champ(id: string, extra: Partial<Championship> & Record<string, unknown> = {}): Championship {
  return {
    championshipId: id, name: `Title ${id}`, type: 'singles', isActive: true,
    createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

function player(id: string, name: string, wrestler: string, extra: Partial<Player> = {}): Player {
  return {
    playerId: id, name, currentWrestler: wrestler,
    wins: 0, losses: 0, draws: 0,
    createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    ...extra,
  } as Player;
}

function team(id: string, name: string, p1: string, p2: string, extra: Partial<TagTeam> = {}): TagTeam {
  return {
    tagTeamId: id, name, player1Id: p1, player2Id: p2, status: 'active',
    wins: 0, losses: 0, draws: 0,
    createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

function row(cid: string, id: string, rank: number, extra: Partial<ContenderRanking> = {}): ContenderRanking {
  return {
    championshipId: cid, playerId: id, rank, rankingScore: 90 - rank,
    winPercentage: 75, currentStreak: 3, matchesInPeriod: 8, winsInPeriod: 6,
    previousRank: rank + 1, calculatedAt: '2025-02-01T00:00:00Z',
    updatedAt: '2025-02-01T00:00:00Z',
    ...extra,
  };
}

function tagRow(cid: string, tagTeamId: string, rank: number, extra: Partial<ContenderRanking> = {}): ContenderRanking {
  return row(cid, tagTeamId, rank, { entityType: 'tagTeam', tagTeamId, ...extra });
}

/** Players keyed by id, served by both player lookups. Deleted ones only by `findByIdWithDeleted`. */
function servePlayers(list: Player[]): void {
  const byId = new Map(list.map((p) => [p.playerId, p]));
  mockPlayersRepo.findById.mockImplementation(async (id: string) => {
    const found = byId.get(id);
    return found && !found.deletedAt ? found : null;
  });
  mockPlayersRepo.findByIdWithDeleted.mockImplementation(async (id: string) => byId.get(id) ?? null);
}

// ─── Singles: unchanged output ──────────────────────────────────────

describe('getContenders — singles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the singles response byte-identical', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(
      champ('world', { name: 'World Title', divisionId: 'raw', currentChampion: 'p-champ' }),
    );
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([
      row('world', 'p-champ', 1),
      row('world', 'p1', 2, { isOverridden: true, overrideType: 'bump_to_top', organicRank: 4 }),
      row('world', 'p-hidden', 3),
      row('world', 'p2', 4, { previousRank: null, calculatedAt: '2025-02-02T00:00:00Z' }),
      row('world', 'p-gone', 5),
    ]);
    servePlayers([
      player('p-champ', 'Champ Player', 'Roman Reigns', { imageUrl: 'roman.jpg' }),
      player('p1', 'One', 'Seth Rollins', { imageUrl: 'seth.jpg' }),
      player('p-hidden', 'Hidden', 'Needs Wrestler'),
      player('p2', 'Two', 'Drew McIntyre'),
    ]);

    const result = await call('world');

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchSnapshot();
    expect(mockTagTeamsRepo.listAll).not.toHaveBeenCalled();
  });

  it('keeps an empty singles response byte-identical', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('ic'));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([]);

    const result = await call('ic');

    expect(result.body).toMatchSnapshot();
  });
});

// ─── Tag titles ─────────────────────────────────────────────────────

interface MemberBody { playerId: string; playerName: string; wrestlerName: string; imageUrl: string | null }
interface TagRowBody {
  rank: number; entityType?: string; playerId: string; tagTeamId: string; tagTeamName: string;
  tagTeamImageUrl: string | null; tagTeamStatus: string; members: MemberBody[];
  playerName: string; wrestlerName: string; imageUrl: string | null; movement: number; isNew: boolean;
}
interface TagChampionBody {
  type: string; tagTeamId: string | null; tagTeamName: string | null; tagTeamImageUrl: string | null;
  members: MemberBody[]; playerName: string; wrestlerName: string; imageUrl: string | null;
}
interface TagBody { currentChampion: TagChampionBody | null; contenders: TagRowBody[] }

const TAG_PLAYERS = [
  player('a1', 'Alice', 'Dax Harwood', { imageUrl: 'dax.jpg' }),
  player('a2', 'Ann', 'Cash Wheeler'),
  player('b1', 'Bob', 'Jey Uso', { imageUrl: 'jey.jpg' }),
  player('b2', 'Ben', 'Jimmy Uso'),
  player('c1', 'Cat', 'Angelo Dawkins'),
  player('c2', 'Cid', 'Montez Ford', { deletedAt: '2025-01-20T00:00:00Z' }),
  player('d1', 'Dan', 'Kofi Kingston'),
  player('d2', 'Dee', 'Xavier Woods'),
];

describe('getContenders — tag titles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    servePlayers(TAG_PLAYERS);
  });

  it('returns team rows with both members enriched', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('tag', { type: 'tag' }));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([
      tagRow('tag', 'ftr', 1),
      tagRow('tag', 'usos', 2, { previousRank: null }),
    ]);
    mockTagTeamsRepo.listAll.mockResolvedValue([
      team('ftr', 'FTR', 'a1', 'a2', { imageUrl: 'ftr.jpg' }),
      team('usos', 'The Usos', 'b1', 'b2'),
    ]);

    const result = await call('tag');
    const body = JSON.parse(result.body) as TagBody;

    expect(result.statusCode).toBe(200);
    expect(body.currentChampion).toBeNull();
    expect(body.contenders).toHaveLength(2);
    expect(body.contenders[0]).toMatchObject({
      rank: 1, entityType: 'tagTeam', playerId: 'ftr', tagTeamId: 'ftr',
      tagTeamName: 'FTR', tagTeamImageUrl: 'ftr.jpg', tagTeamStatus: 'active',
      wrestlerName: 'FTR', playerName: 'Alice & Ann', imageUrl: 'ftr.jpg',
      movement: 1, isNew: false,
    });
    expect(body.contenders[0].members).toEqual([
      { playerId: 'a1', playerName: 'Alice', wrestlerName: 'Dax Harwood', imageUrl: 'dax.jpg' },
      { playerId: 'a2', playerName: 'Ann', wrestlerName: 'Cash Wheeler', imageUrl: null },
    ]);
    expect(body.contenders[1]).toMatchObject({ rank: 2, tagTeamName: 'The Usos', tagTeamImageUrl: null, isNew: true });
    expect(body.contenders[1].members.map((m) => m.playerId)).toEqual(['b1', 'b2']);
  });

  it('loads tag teams once and members in one pass, not per row', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('tag', { type: 'tag', currentChampion: ['d1', 'd2'] }));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([
      tagRow('tag', 'ftr', 1), tagRow('tag', 'usos', 2),
    ]);
    mockTagTeamsRepo.listAll.mockResolvedValue([
      team('ftr', 'FTR', 'a1', 'a2'), team('usos', 'The Usos', 'b1', 'b2'), team('newday', 'New Day', 'd1', 'd2'),
    ]);

    await call('tag');

    expect(mockTagTeamsRepo.listAll).toHaveBeenCalledTimes(1);
    expect(mockPlayersRepo.findById).not.toHaveBeenCalled();
    const fetched = mockPlayersRepo.findByIdWithDeleted.mock.calls.map(([id]) => id as string).sort();
    expect(fetched).toEqual(['a1', 'a2', 'b1', 'b2', 'd1', 'd2']);
  });

  it('builds the champion block from both holders and drops the champion team from the list', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('tag', { type: 'tag', currentChampion: ['d2', 'd1'] }));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([
      tagRow('tag', 'newday', 1), tagRow('tag', 'ftr', 2, { previousRank: 3 }),
    ]);
    mockTagTeamsRepo.listAll.mockResolvedValue([
      team('ftr', 'FTR', 'a1', 'a2'),
      team('newday', 'New Day', 'd1', 'd2', { imageUrl: 'newday.jpg' }),
    ]);

    const body = JSON.parse((await call('tag')).body) as TagBody;

    expect(body.currentChampion).toEqual({
      type: 'tagTeam', tagTeamId: 'newday', tagTeamName: 'New Day', tagTeamImageUrl: 'newday.jpg',
      members: [
        { playerId: 'd2', playerName: 'Dee', wrestlerName: 'Xavier Woods', imageUrl: null },
        { playerId: 'd1', playerName: 'Dan', wrestlerName: 'Kofi Kingston', imageUrl: null },
      ],
      playerName: 'Dee & Dan', wrestlerName: 'New Day', imageUrl: 'newday.jpg',
    });
    expect(body.contenders.map((c) => c.tagTeamId)).toEqual(['ftr']);
    expect(body.contenders[0]).toMatchObject({ rank: 1, movement: 2 });
  });

  it('prefers currentTagTeamId over the pair when the championship records it', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(
      champ('tag', { type: 'tag', currentChampion: ['d1', 'd2'], currentTagTeamId: 'newday-v2' }),
    );
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([]);
    mockTagTeamsRepo.listAll.mockResolvedValue([
      team('newday-v1', 'New Day', 'd1', 'd2', { createdAt: '2025-03-01T00:00:00Z' }),
      team('newday-v2', 'The New Day', 'd1', 'd2', { status: 'dissolved', dissolvedAt: '2025-02-01T00:00:00Z' }),
    ]);

    const body = JSON.parse((await call('tag')).body) as TagBody;

    expect(body.currentChampion).toMatchObject({ tagTeamId: 'newday-v2', tagTeamName: 'The New Day' });
  });

  it('resolves the active team for the champion pair when currentTagTeamId is absent', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('tag', { type: 'tag', currentChampion: ['d1', 'd2'] }));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([]);
    mockTagTeamsRepo.listAll.mockResolvedValue([
      team('old', 'Old Day', 'd1', 'd2', { status: 'dissolved', dissolvedAt: '2025-01-10T00:00:00Z' }),
      team('new', 'New Day', 'd2', 'd1', { createdAt: '2025-01-15T00:00:00Z' }),
    ]);

    const body = JSON.parse((await call('tag')).body) as TagBody;

    expect(body.currentChampion).toMatchObject({ tagTeamId: 'new', tagTeamName: 'New Day' });
  });

  it('returns a champion block with null team fields when the holders are not a team', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('tag', { type: 'tag', currentChampion: ['a1', 'b1'] }));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([]);
    mockTagTeamsRepo.listAll.mockResolvedValue([team('ftr', 'FTR', 'a1', 'a2')]);

    const body = JSON.parse((await call('tag')).body) as TagBody;

    expect(body.currentChampion).toMatchObject({
      type: 'tagTeam', tagTeamId: null, tagTeamName: null, tagTeamImageUrl: null,
      playerName: 'Alice & Bob', wrestlerName: 'Dax Harwood & Jey Uso', imageUrl: null,
    });
    expect(body.currentChampion?.members.map((m) => m.playerId)).toEqual(['a1', 'b1']);
  });

  it('still names a dissolved team and its soft-deleted member on a stored row', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('tag', { type: 'tag' }));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([tagRow('tag', 'profits', 1)]);
    mockTagTeamsRepo.listAll.mockResolvedValue([
      team('profits', 'Street Profits', 'c1', 'c2', {
        status: 'dissolved', dissolvedAt: '2025-01-25T00:00:00Z',
      }),
    ]);

    const body = JSON.parse((await call('tag')).body) as TagBody;

    expect(body.contenders).toHaveLength(1);
    expect(body.contenders[0]).toMatchObject({ tagTeamName: 'Street Profits', tagTeamStatus: 'dissolved' });
    expect(body.contenders[0].members[1]).toEqual({
      playerId: 'c2', playerName: 'Cid', wrestlerName: 'Montez Ford', imageUrl: null,
    });
  });

  it('falls back to the stored wrestler name when a member row is gone, and drops rows whose team is gone', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('tag', { type: 'tag' }));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([
      tagRow('tag', 'ghost', 1), tagRow('tag', 'mixed', 2),
    ]);
    mockTagTeamsRepo.listAll.mockResolvedValue([
      team('mixed', 'Mixed', 'a1', 'zz', { player2WrestlerName: 'Old Name' }),
    ]);

    const body = JSON.parse((await call('tag')).body) as TagBody;

    expect(body.contenders).toHaveLength(1);
    expect(body.contenders[0]).toMatchObject({ rank: 1, tagTeamId: 'mixed' });
    expect(body.contenders[0].members[1]).toEqual({
      playerId: 'zz', playerName: 'Former member', wrestlerName: 'Old Name', imageUrl: null,
    });
  });

  it('still enriches legacy player rows on a tag title as player rows', async () => {
    mockChampionshipsRepo.findById.mockResolvedValue(champ('tag', { type: 'tag' }));
    mockContendersRepo.listByChampionshipRanked.mockResolvedValue([row('tag', 'a1', 1)]);
    mockTagTeamsRepo.listAll.mockResolvedValue([]);

    const body = JSON.parse((await call('tag')).body) as { contenders: Record<string, unknown>[] };

    expect(body.contenders[0]).toMatchObject({ playerId: 'a1', playerName: 'Alice', wrestlerName: 'Dax Harwood' });
    expect(body.contenders[0]).not.toHaveProperty('entityType');
  });
});
