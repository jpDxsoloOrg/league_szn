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
import { NEEDS_WRESTLER } from '../../lib/needsWrestler';
import { handler as getPlayers } from '../players/getPlayers';
import { handler as getPlayer } from '../players/getPlayer';
import { handler as getPlayerStatistics } from '../players/getPlayerStatistics';
import { handler as getMyProfile } from '../players/getMyProfile';
import { handler as updateMyProfile } from '../players/updateMyProfile';
import { handler as updatePlayer } from '../players/updatePlayer';
import { handler as getStandings } from '../standings/getStandings';
import { handler as getDashboard } from '../dashboard/getDashboard';
import { handler as getStatistics } from '../statistics/getStatistics';
import { handler as getMatchHistoryRivalries } from '../rivalries/getMatchHistoryRivalries';
import { handler as getContenders } from '../contenders/getContenders';
import { handler as getOnline } from '../matchmaking/getOnline';
import { handler as getQueue } from '../matchmaking/getQueue';
import { handler as getStable } from '../stables/getStable';
import { handler as getFactionStats } from '../stables/getFactionStats';
import { handler as getActivity } from '../activity/getActivity';
import { handler as getEvent } from '../events/getEvent';
import { handler as getCommentary } from '../events/getCommentary';
import { handler as getTagTeams } from '../tagTeams/getTagTeams';
import { handler as getTagTeam } from '../tagTeams/getTagTeam';
import { handler as getTagTeamStandings } from '../tagTeams/getTagTeamStandings';
import { handler as getSeasonAwards } from '../seasonAwards/getSeasonAwards';
import { handler as claimSlot } from '../matches/claimSlot';
import {
  authedEvent,
  bearer,
  call,
  makeEvent,
  seedRoster,
  type RosterSeed,
} from './visibilityTestHelpers';

interface PlayerRow {
  playerId: string;
  name?: string;
  currentWrestler?: string | null;
  [key: string]: unknown;
}

let repos: Repositories;
let roster: RosterSeed;

const ids = (rows: Array<{ playerId: string }>): string[] => rows.map((row) => row.playerId);

async function linkUser(playerId: string, userId: string): Promise<void> {
  await repos.roster.players.update(playerId, { userId });
}

async function completeMatch(
  matchId: string,
  winner: string,
  loser: string,
  date = '2026-01-01T00:00:00.000Z',
): Promise<void> {
  await repos.competition.matches.create({
    matchId,
    date,
    matchFormat: 'singles',
    participants: [winner, loser],
    winners: [winner],
    losers: [loser],
    status: 'completed',
    createdAt: date,
    updatedAt: date,
  });
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  roster = await seedRoster(repos);
});

afterEach(() => resetRepositoriesForTesting());

describe('GET /players', () => {
  it('leaves out placeholder and whitespace names by default', async () => {
    const { statusCode, body } = await call<PlayerRow[]>(getPlayers, makeEvent());
    expect(statusCode).toBe(200);
    expect(ids(body)).toEqual([roster.visibleId]);
  });

  it.each(['Admin', 'Moderator'])('honours includeHidden for a verified %s', async (group) => {
    const event = makeEvent({
      ...bearer('staff-sub', group),
      queryStringParameters: { includeHidden: 'true' },
    });
    const { body } = await call<PlayerRow[]>(getPlayers, event);
    expect(ids(body).sort()).toEqual(
      [roster.visibleId, roster.placeholderId, roster.blankId].sort(),
    );
  });

  it.each([
    ['an anonymous caller', {}],
    ['a Wrestler', bearer('wrestler-sub', 'Wrestler')],
    ['an invalid token', { headers: { Authorization: 'Bearer invalid' } }],
  ])('ignores includeHidden for %s', async (_label, auth) => {
    const event = makeEvent({ ...auth, queryStringParameters: { includeHidden: 'true' } });
    const { statusCode, body } = await call<PlayerRow[]>(getPlayers, event);
    expect(statusCode).toBe(200);
    expect(ids(body)).toEqual([roster.visibleId]);
  });

  it('ignores includeHidden when staff do not ask for it', async () => {
    const { body } = await call<PlayerRow[]>(getPlayers, makeEvent(bearer('staff', 'Admin')));
    expect(ids(body)).toEqual([roster.visibleId]);
  });

  describe('view=directory', () => {
    it('covers every player and exposes only the whitelisted fields', async () => {
      await repos.roster.players.update(roster.visibleId, {
        userId: 'secret-user',
        psnId: 'secret-psn',
        imageUrl: 'secret.png',
      });

      const { body } = await call<PlayerRow[]>(
        getPlayers,
        makeEvent({ queryStringParameters: { view: 'directory' } }),
      );

      expect(body).toHaveLength(3);
      for (const row of body) {
        expect(Object.keys(row).sort()).toEqual(['currentWrestler', 'name', 'playerId']);
      }
    });

    it('returns null for a blank or placeholder wrestler', async () => {
      const { body } = await call<PlayerRow[]>(
        getPlayers,
        makeEvent({ queryStringParameters: { view: 'directory' } }),
      );
      const wrestlerOf = (playerId: string): string | null | undefined =>
        body.find((row) => row.playerId === playerId)?.currentWrestler;

      expect(wrestlerOf(roster.visibleId)).toBe('The Rock');
      expect(wrestlerOf(roster.placeholderId)).toBeNull();
      expect(wrestlerOf(roster.blankId)).toBeNull();
    });

    it('stays a whitelist even if staff also pass includeHidden', async () => {
      const event = makeEvent({
        ...bearer('staff', 'Admin'),
        queryStringParameters: { view: 'directory', includeHidden: 'true' },
      });
      const { body } = await call<PlayerRow[]>(getPlayers, event);
      expect(Object.keys(body[0]).sort()).toEqual(['currentWrestler', 'name', 'playerId']);
    });
  });
});

describe.each([
  ['getPlayer', getPlayer],
  ['getPlayerStatistics', getPlayerStatistics],
])('%s hidden access', (_label, handler) => {
  const eventFor = (playerId: string, auth = {}) =>
    makeEvent({ ...auth, pathParameters: { playerId } });

  beforeEach(() => linkUser(roster.placeholderId, 'owner-sub'));

  it('serves a visible player to anyone', async () => {
    expect((await call(handler, eventFor(roster.visibleId))).statusCode).toBe(200);
  });

  it('404s a hidden player for anonymous callers and invalid tokens', async () => {
    expect((await call(handler, eventFor(roster.placeholderId))).statusCode).toBe(404);
    const invalid = { headers: { Authorization: 'Bearer invalid' } };
    expect((await call(handler, eventFor(roster.placeholderId, invalid))).statusCode).toBe(404);
  });

  it('404s a hidden player for a different wrestler', async () => {
    const auth = bearer('other-sub', 'Wrestler');
    expect((await call(handler, eventFor(roster.placeholderId, auth))).statusCode).toBe(404);
  });

  it('serves a hidden player to themselves', async () => {
    const auth = bearer('owner-sub', 'Wrestler');
    expect((await call(handler, eventFor(roster.placeholderId, auth))).statusCode).toBe(200);
  });

  it.each(['Admin', 'Moderator'])('serves a hidden player to a %s', async (group) => {
    const auth = bearer('staff-sub', group);
    expect((await call(handler, eventFor(roster.blankId, auth))).statusCode).toBe(200);
  });
});

describe('own profile', () => {
  beforeEach(() => linkUser(roster.placeholderId, 'owner-sub'));

  it('getMyProfile still works for a hidden player', async () => {
    const { statusCode, body } = await call<PlayerRow>(
      getMyProfile,
      authedEvent('owner-sub', 'Wrestler'),
    );
    expect(statusCode).toBe(200);
    expect(body.playerId).toBe(roster.placeholderId);
  });

  it('updateMyProfile lets a hidden player set a wrestler name', async () => {
    const event = authedEvent('owner-sub', 'Wrestler', {
      body: JSON.stringify({ currentWrestler: 'Kane' }),
    });
    const { statusCode, body } = await call<PlayerRow>(updateMyProfile, event);
    expect(statusCode).toBe(200);
    expect(body.currentWrestler).toBe('Kane');
  });

  it.each([[''], ['   ']])('updateMyProfile normalizes %j to the placeholder', async (name) => {
    await repos.roster.players.update(roster.placeholderId, { currentWrestler: 'Kane' });
    const event = authedEvent('owner-sub', 'Wrestler', {
      body: JSON.stringify({ currentWrestler: name }),
    });
    const { body } = await call<PlayerRow>(updateMyProfile, event);
    expect(body.currentWrestler).toBe(NEEDS_WRESTLER);
  });
});

describe('updatePlayer', () => {
  it.each([[''], ['   ']])('normalizes %j to the placeholder', async (name) => {
    const event = authedEvent('staff-sub', 'Admin', {
      pathParameters: { playerId: roster.visibleId },
      body: JSON.stringify({ currentWrestler: name }),
    });
    const { body } = await call<PlayerRow>(updatePlayer, event);
    expect(body.currentWrestler).toBe(NEEDS_WRESTLER);
  });

  it('keeps a real name', async () => {
    const event = authedEvent('staff-sub', 'Admin', {
      pathParameters: { playerId: roster.placeholderId },
      body: JSON.stringify({ currentWrestler: 'Kane' }),
    });
    const { body } = await call<PlayerRow>(updatePlayer, event);
    expect(body.currentWrestler).toBe('Kane');
  });
});

describe('getStandings', () => {
  it('filters the all-time standings', async () => {
    const { body } = await call<{ players: PlayerRow[] }>(getStandings, makeEvent());
    expect(ids(body.players)).toEqual([roster.visibleId]);
  });

  it('filters the season standings', async () => {
    const event = makeEvent({ queryStringParameters: { seasonId: 'season-1' } });
    const { body } = await call<{ players: PlayerRow[] }>(getStandings, event);
    expect(ids(body.players)).toEqual([roster.visibleId]);
  });
});

describe('getDashboard', () => {
  interface Dashboard {
    quickStats: { totalPlayers: number; mostWinsPlayer?: { name: string; wins: number } };
    recentResults: Array<{ winnerName: string; loserName: string }>;
  }

  it('counts only visible players and skips hidden most-wins leaders', async () => {
    await repos.runInTransaction(async (tx) => {
      tx.incrementPlayerRecord(roster.placeholderId, { wins: 50 });
      tx.incrementPlayerRecord(roster.visibleId, { wins: 2 });
    });

    const { body } = await call<Dashboard>(getDashboard, makeEvent());

    expect(body.quickStats.totalPlayers).toBe(1);
    expect(body.quickStats.mostWinsPlayer).toEqual({ name: 'The Rock', wins: 2 });
  });

  it('skips a hidden leader in the active season without blocking the next player', async () => {
    const season = await repos.season.seasons.create({
      name: 'Season 1',
      startDate: '2026-01-01T00:00:00.000Z',
    });
    await repos.season.standings.increment(season.seasonId, roster.placeholderId, { wins: 9 });
    await repos.season.standings.increment(season.seasonId, roster.visibleId, { wins: 1 });

    const { body } = await call<Dashboard>(getDashboard, makeEvent());

    expect(body.quickStats.mostWinsPlayer).toEqual({ name: 'The Rock', wins: 1 });
  });

  describe('current champions', () => {
    interface Champions {
      currentChampions: Array<{ championName: string }>;
    }

    it.each([
      ['placeholder', 'placeholderId', 'Placeholder Person'],
      ['blank', 'blankId', 'Blank Person'],
    ] as const)('keeps the title and shows a %s champion by their own name', async (_label, idKey, expected) => {
      await repos.competition.championships.create({
        name: 'World Title',
        type: 'singles',
        currentChampion: roster[idKey],
      });

      const { body } = await call<Champions>(getDashboard, makeEvent());

      expect(body.currentChampions).toHaveLength(1);
      expect(JSON.stringify(body.currentChampions)).toContain(expected);
      expect(JSON.stringify(body.currentChampions)).not.toContain(NEEDS_WRESTLER);
    });
  });

  it('still resolves a hidden player in recent results', async () => {
    const now = new Date().toISOString();
    await completeMatch('m1', roster.visibleId, roster.placeholderId, now);

    const { body } = await call<Dashboard>(getDashboard, makeEvent());

    expect(body.recentResults).toHaveLength(1);
    expect(body.recentResults[0].loserName).toBe('Placeholder Person');
  });
});

describe('getStatistics', () => {
  interface PlayersPayload {
    players: PlayerRow[];
    statistics?: unknown[];
  }

  it('leaves hidden players out of the player list', async () => {
    const event = makeEvent({ queryStringParameters: { section: 'player-stats' } });
    const { body } = await call<PlayersPayload>(getStatistics, event);
    expect(ids(body.players)).toEqual([roster.visibleId]);
  });

  it('leaves hidden players out of the average match ratings', async () => {
    const date = '2026-01-01T00:00:00.000Z';
    await repos.competition.matches.create({
      matchId: 'rated',
      date,
      matchFormat: 'singles',
      participants: [roster.visibleId, roster.placeholderId],
      winners: [roster.visibleId],
      losers: [roster.placeholderId],
      status: 'completed',
      starRating: 4,
      createdAt: date,
      updatedAt: date,
    });

    const { body } = await call<{
      highestRatedMatches: unknown[];
      playerAverageRatings: PlayerRow[];
    }>(getStatistics, makeEvent({ queryStringParameters: { section: 'match-ratings' } }));

    expect(ids(body.playerAverageRatings)).toEqual([roster.visibleId]);
    expect(body.highestRatedMatches).toHaveLength(1);
  });

  it('does not return stats for a hidden player ID', async () => {
    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: roster.placeholderId },
    });
    const { body } = await call<PlayersPayload>(getStatistics, event);
    expect(body.statistics).toBeUndefined();
  });

  it('still returns stats for a visible player ID', async () => {
    const event = makeEvent({
      queryStringParameters: { section: 'player-stats', playerId: roster.visibleId },
    });
    const { body } = await call<PlayersPayload>(getStatistics, event);
    expect(body.statistics).toBeDefined();
  });
});

describe('getMatchHistoryRivalries', () => {
  interface Rivalries {
    rivalries: Array<{ player1?: PlayerRow; player2?: PlayerRow }>;
  }

  it('drops pairs with a hidden player, so no row has an undefined player', async () => {
    for (const n of [1, 2, 3]) {
      await completeMatch(`hidden-${n}`, roster.visibleId, roster.placeholderId);
    }
    const { body } = await call<Rivalries>(getMatchHistoryRivalries, makeEvent());
    expect(body.rivalries).toEqual([]);
  });

  it('does not let hidden pairs push a visible rivalry past the cap', async () => {
    const opponents: string[] = [];
    for (let n = 0; n < 21; n++) {
      const hidden = await repos.roster.players.create({ name: `H${n}`, currentWrestler: '' });
      opponents.push(hidden.playerId);
      for (let m = 0; m < 5; m++) {
        await completeMatch(`noise-${n}-${m}`, roster.visibleId, hidden.playerId);
      }
    }
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    for (const n of [1, 2, 3]) {
      await completeMatch(`real-${n}`, roster.visibleId, rival.playerId);
    }

    const { body } = await call<Rivalries>(getMatchHistoryRivalries, makeEvent());

    expect(body.rivalries).toHaveLength(1);
    expect(body.rivalries[0].player1).toBeDefined();
    expect(body.rivalries[0].player2).toBeDefined();
  });
});

describe('getContenders', () => {
  it('drops hidden contenders and closes the rank gap', async () => {
    const championship = await repos.competition.championships.create({
      name: 'World Title',
      type: 'singles',
    });
    const rank = (playerId: string, position: number) =>
      repos.competition.contenders.upsertRanking({
        championshipId: championship.championshipId,
        playerId,
        rank: position,
        rankingScore: 100 - position,
        winPercentage: 50,
        currentStreak: 0,
        matchesInPeriod: 1,
        winsInPeriod: 1,
      });
    await rank(roster.placeholderId, 1);
    await rank(roster.visibleId, 2);

    const { body } = await call<{ contenders: Array<PlayerRow & { rank: number }> }>(
      getContenders,
      makeEvent({ pathParameters: { championshipId: championship.championshipId } }),
    );

    expect(ids(body.contenders)).toEqual([roster.visibleId]);
    expect(body.contenders[0].rank).toBe(1);
  });
});

describe('matchmaking boards', () => {
  const inFuture = (): number => Math.floor(Date.now() / 1000) + 600;

  beforeEach(async () => {
    await linkUser(roster.placeholderId, 'hidden-sub');
    const caller = await repos.roster.players.create({ name: 'C', currentWrestler: 'Kane' });
    await linkUser(caller.playerId, 'caller-sub');
  });

  it('getOnline leaves out hidden players', async () => {
    const { matchmaking } = repos.leagueOps;
    const lastSeenAt = new Date().toISOString();
    for (const playerId of [roster.visibleId, roster.placeholderId]) {
      await matchmaking.putPresence({ playerId, lastSeenAt, ttl: inFuture() });
    }

    const { body } = await call<PlayerRow[]>(getOnline, authedEvent('caller-sub', 'Wrestler'));

    expect(ids(body)).toEqual([roster.visibleId]);
  });

  const queueBoth = async (): Promise<void> => {
    const { matchmaking } = repos.leagueOps;
    const joinedAt = new Date().toISOString();
    for (const playerId of [roster.visibleId, roster.placeholderId]) {
      await matchmaking.putQueue({ playerId, joinedAt, ttl: inFuture() });
    }
  };

  it('getQueue hides a queued hidden player from others', async () => {
    await queueBoth();
    const { body } = await call<PlayerRow[]>(getQueue, authedEvent('caller-sub', 'Wrestler'));
    expect(ids(body)).toEqual([roster.visibleId]);
  });

  it('getQueue keeps the caller\'s own row while they are hidden', async () => {
    await queueBoth();
    const { body } = await call<PlayerRow[]>(getQueue, authedEvent('hidden-sub', 'Wrestler'));
    expect(ids(body).sort()).toEqual([roster.visibleId, roster.placeholderId].sort());
  });
});

describe('stable member rows', () => {
  let stableId: string;

  beforeEach(async () => {
    const stable = await repos.roster.stables.create({
      name: 'The Corporation',
      leaderId: roster.placeholderId,
      memberIds: [roster.visibleId, roster.placeholderId],
      status: 'active',
    });
    stableId = stable.stableId;
  });

  it('getStable lists visible members and does not name a hidden leader', async () => {
    const { body } = await call<{ members: PlayerRow[]; leaderName?: string }>(
      getStable,
      makeEvent({ pathParameters: { stableId } }),
    );
    expect(ids(body.members)).toEqual([roster.visibleId]);
    expect(body.leaderName).toBeUndefined();
  });

  it('getFactionStats lists visible members but keeps faction totals', async () => {
    await completeMatch('m1', roster.placeholderId, 'outsider', new Date().toISOString());

    const { body } = await call<{ members: PlayerRow[]; totals: { wins: number } }>(
      getFactionStats,
      makeEvent({ pathParameters: { stableId } }),
    );

    expect(ids(body.members)).toEqual([roster.visibleId]);
    expect(body.totals.wins).toBe(1);
  });
});

describe('getActivity', () => {
  interface Feed {
    items: Array<{
      id: string;
      type: string;
      summary: string;
      metadata: Record<string, unknown>;
    }>;
  }

  const promoContent = 'x'.repeat(60);

  it('drops promos and challenges authored by hidden players', async () => {
    await repos.content.promos.create({
      playerId: roster.placeholderId,
      promoType: 'open-mic',
      content: promoContent,
    });
    const visiblePromo = await repos.content.promos.create({
      playerId: roster.visibleId,
      promoType: 'open-mic',
      content: promoContent,
    });
    await repos.user.challenges.create({
      challengerId: roster.placeholderId,
      challengedId: roster.visibleId,
      matchType: 'singles',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });

    const { body } = await call<Feed>(getActivity, makeEvent());

    expect(body.items.map((item) => item.id)).toEqual([`promo-${visiblePromo.promoId}`]);
  });

  it('drops a challenge aimed at a hidden player', async () => {
    await repos.user.challenges.create({
      challengerId: roster.visibleId,
      challengedId: roster.placeholderId,
      matchType: 'singles',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });

    const { body } = await call<Feed>(getActivity, makeEvent());

    expect(body.items).toEqual([]);
  });

  it('treats a pending challenge past its deadline as lapsed before the sweep runs', async () => {
    const other = await repos.roster.players.create({ name: 'Other', currentWrestler: 'Kane' });
    await repos.user.challenges.create({
      challengerId: roster.visibleId,
      challengedId: other.playerId,
      matchType: 'singles',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    const open = await repos.user.challenges.create({
      challengerId: roster.visibleId,
      challengedId: other.playerId,
      matchType: 'singles',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });

    const { body } = await call<Feed>(getActivity, makeEvent());

    expect(body.items.map((item) => item.id)).toEqual([`challenge-${open.challengeId}`]);
  });

  it('keeps match history for hidden players and still names them', async () => {
    await completeMatch('m1', roster.visibleId, roster.placeholderId);

    const { body } = await call<Feed>(getActivity, makeEvent());

    expect(body.items).toHaveLength(1);
    expect(body.items[0].summary).toBe('Visible Person def. Placeholder Person');
  });
});

describe('tag teams with a hidden member', () => {
  const seedTeam = async (member: string): Promise<string> => {
    const team = await repos.roster.tagTeams.create({
      name: 'The Team',
      player1Id: roster.visibleId,
      player2Id: member,
      status: 'active',
    });
    return team.tagTeamId;
  };

  const teamIds = (rows: Array<{ tagTeamId: string }>): string[] => rows.map((row) => row.tagTeamId);

  it('getTagTeams drops the team for the public', async () => {
    const hiddenTeam = await seedTeam(roster.placeholderId);
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    const shownTeam = await seedTeam(rival.playerId);

    const { body } = await call<Array<{ tagTeamId: string }>>(getTagTeams, makeEvent());

    expect(teamIds(body)).toEqual([shownTeam]);
    expect(teamIds(body)).not.toContain(hiddenTeam);
  });

  it('getTagTeams keeps the team for staff and for its members', async () => {
    const team = await seedTeam(roster.placeholderId);
    await linkUser(roster.placeholderId, 'hidden-sub');

    const staff = await call<Array<{ tagTeamId: string }>>(
      getTagTeams,
      makeEvent(bearer('staff', 'Moderator')),
    );
    const member = await call<Array<{ tagTeamId: string }>>(
      getTagTeams,
      makeEvent(bearer('hidden-sub', 'Wrestler')),
    );

    expect(teamIds(staff.body)).toEqual([team]);
    expect(teamIds(member.body)).toEqual([team]);
  });

  it('getTagTeamStandings drops the team', async () => {
    await seedTeam(roster.blankId);

    const { body } = await call<Array<{ tagTeamId: string }>>(getTagTeamStandings, makeEvent());

    expect(body).toEqual([]);
  });

  it('getTagTeam 404s for the public and serves staff and members', async () => {
    const tagTeamId = await seedTeam(roster.placeholderId);
    await linkUser(roster.placeholderId, 'hidden-sub');
    const statusFor = async (auth = {}): Promise<number> =>
      (await call(getTagTeam, makeEvent({ ...auth, pathParameters: { tagTeamId } }))).statusCode;

    expect(await statusFor()).toBe(404);
    expect(await statusFor(bearer('staff', 'Admin'))).toBe(200);
    expect(await statusFor(bearer('hidden-sub', 'Wrestler'))).toBe(200);
  });

  it('getTagTeam shows a member by name, never the placeholder', async () => {
    const tagTeamId = await seedTeam(roster.placeholderId);

    const { body } = await call<{ player2: { wrestlerName: string } }>(
      getTagTeam,
      makeEvent({ ...bearer('staff', 'Admin'), pathParameters: { tagTeamId } }),
    );

    expect(body.player2.wrestlerName).toBe('Placeholder Person');
  });

  it('getTagTeam keeps serving a team whose player record is gone', async () => {
    const tagTeamId = await seedTeam('deleted-player');

    const { statusCode } = await call(
      getTagTeam,
      makeEvent({ pathParameters: { tagTeamId } }),
    );

    expect(statusCode).toBe(200);
  });
});

describe('getSeasonAwards', () => {
  interface Awards {
    autoAwards: Array<{ awardType: string; playerId: string }>;
    customAwards: Array<{ awardId: string }>;
  }

  const seedSeason = async (): Promise<string> => {
    const { seasonId } = await repos.season.seasons.create({
      name: 'Season 1',
      startDate: '2026-01-01T00:00:00.000Z',
    });
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    const fixtures: Array<[string, string, string]> = [
      ['m1', roster.placeholderId, rival.playerId],
      ['m2', roster.placeholderId, roster.visibleId],
      ['m3', roster.placeholderId, rival.playerId],
      ['m4', roster.visibleId, rival.playerId],
    ];
    for (const [matchId, winner, loser] of fixtures) {
      await repos.competition.matches.create({
        matchId,
        date: `2026-01-0${matchId.slice(1)}T00:00:00.000Z`,
        matchFormat: 'singles',
        participants: [winner, loser],
        winners: [winner],
        losers: [loser],
        status: 'completed',
        seasonId,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    }
    return seasonId;
  };

  it('passes an award to the next eligible wrestler', async () => {
    const seasonId = await seedSeason();

    const { body } = await call<Awards>(getSeasonAwards, makeEvent({ pathParameters: { seasonId } }));

    expect(ids(body.autoAwards)).not.toContain(roster.placeholderId);
    expect(body.autoAwards.find((award) => award.awardType === 'mvp')?.playerId).toBe(roster.visibleId);
  });

  it('shows a custom award for a hidden player to staff only', async () => {
    const seasonId = await seedSeason();
    const award = await repos.season.awards.create({
      seasonId,
      name: 'Best Promo',
      awardType: 'custom',
      playerId: roster.placeholderId,
      playerName: 'Placeholder Person',
    });
    const customFor = async (auth = {}): Promise<string[]> => {
      const { body } = await call<Awards>(
        getSeasonAwards,
        makeEvent({ ...auth, pathParameters: { seasonId } }),
      );
      return body.customAwards.map((row) => row.awardId);
    };

    expect(await customFor()).toEqual([]);
    expect(await customFor(bearer('staff', 'Admin'))).toEqual([award.awardId]);
  });
});

describe('match billing for hidden players', () => {
  const SLOT_DATE = '2026-02-01T00:00:00.000Z';

  const seedCard = async (status: 'completed' | 'open-signups', snapshot?: string) => {
    const matchId = 'card-match';
    await repos.competition.matches.create({
      matchId,
      date: SLOT_DATE,
      matchFormat: 'singles',
      participants: status === 'completed' ? [roster.visibleId, roster.placeholderId] : [],
      status,
      slots: [
        { slotId: 's1', position: 1, playerId: roster.placeholderId, wrestlerNameSnapshot: snapshot },
        { slotId: 's2', position: 2 },
      ],
      createdAt: SLOT_DATE,
      updatedAt: SLOT_DATE,
    });
    const { eventId } = await repos.leagueOps.events.create({
      name: 'Show',
      eventType: 'ppv',
      date: SLOT_DATE,
    });
    await repos.leagueOps.events.update(eventId, {
      matchCards: [{ position: 1, matchId, designation: 'main-event' }],
    });
    return eventId;
  };

  const enrichedParticipants = (body: unknown): string => JSON.stringify(body);

  it.each([NEEDS_WRESTLER, '   ', undefined])(
    'getEvent names a participant whose snapshot is %j',
    async (snapshot) => {
      const eventId = await seedCard('completed', snapshot);

      const { statusCode, body } = await call(getEvent, makeEvent({ pathParameters: { eventId } }));

      expect(statusCode).toBe(200);
      expect(enrichedParticipants(body)).toContain('Placeholder Person');
      expect(enrichedParticipants(body)).not.toContain(NEEDS_WRESTLER);
    },
  );

  it('getEvent recovers the real name once the player sets one', async () => {
    const eventId = await seedCard('completed', NEEDS_WRESTLER);
    await repos.roster.players.update(roster.placeholderId, { currentWrestler: 'Sting' });

    const { body } = await call(getEvent, makeEvent({ pathParameters: { eventId } }));

    expect(enrichedParticipants(body)).toContain('Sting');
    expect(enrichedParticipants(body)).not.toContain(NEEDS_WRESTLER);
  });

  it('getCommentary never bills the placeholder', async () => {
    const eventId = await seedCard('completed', NEEDS_WRESTLER);

    const { statusCode, body } = await call(getCommentary, makeEvent({ pathParameters: { eventId } }));

    expect(statusCode).toBe(200);
    expect(JSON.stringify(body)).toContain('Placeholder Person');
    expect(JSON.stringify(body)).not.toContain(NEEDS_WRESTLER);
  });

  it('claimSlot turns away a hidden wrestler', async () => {
    await seedCard('open-signups');
    await linkUser(roster.blankId, 'blank-sub');

    const { statusCode, body } = await call<{ message: string }>(
      claimSlot,
      authedEvent('blank-sub', 'Wrestler', {
        httpMethod: 'POST',
        pathParameters: { matchId: 'card-match', slotId: 's2' },
      }),
    );

    expect(statusCode).toBe(400);
    expect(body.message).toBe('Set your wrestler name first');
  });
});
