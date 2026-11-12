import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildInMemoryRepositories } from '../../repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../repositories';
import type { Match, Player, Promo, Season } from '../../repositories/types';
import {
  divisionJoinedAt,
  loadProgressionBatch,
  loadProgressionInputs,
  reactionCountsFromOthers,
  resolveProgressionWindow,
} from '../loadInputs';

let repos: Repositories;

const completedMatch = (matchId: string, partial: Partial<Match>): Match => ({
  matchId,
  date: '2026-03-01T00:00:00.000Z',
  participants: [],
  status: 'completed',
  createdAt: '2026-03-01T00:00:00.000Z',
  ...partial,
});

async function addPlayer(name: string, userId?: string): Promise<Player> {
  const player = await repos.roster.players.create({ name, currentWrestler: name });
  return userId ? repos.roster.players.update(player.playerId, { userId }) : player;
}

describe('loadProgressionBatch', () => {
  beforeEach(() => {
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
  });

  afterEach(() => {
    resetRepositoriesForTesting();
  });

  it('groups matches, promos and challenges by player in one pass', async () => {
    const alice = await addPlayer('Alice', 'user-alice');
    const bob = await addPlayer('Bob');
    const carol = await addPlayer('Carol', 'user-carol');

    await repos.competition.matches.create({ ...completedMatch('m1', {
      participants: [alice.playerId, bob.playerId],
      winners: [alice.playerId],
      losers: [bob.playerId],
      seasonId: 's1',
      ratingAverage: 3.75,
      ratingsCount: 4,
      starRating: 4,
      matchOfTheNight: true,
    }) });
    await repos.competition.matches.create({ ...completedMatch('m2', {
      participants: [alice.playerId, bob.playerId],
      winners: [alice.playerId, bob.playerId],
      isDraw: true,
      starRating: 2.5,
    }) });
    await repos.competition.matches.create({ ...completedMatch('m3', {
      participants: [alice.playerId, carol.playerId],
      status: 'scheduled',
    }) });

    const alicePromo = await repos.content.promos.create({ playerId: alice.playerId, promoType: 'open-mic', content: 'hi' });
    await repos.content.promos.addReaction(alicePromo.promoId, 'user-alice', 'fire');
    await repos.content.promos.addReaction(alicePromo.promoId, 'user-bob', 'fire');
    await repos.content.promos.addReaction(alicePromo.promoId, 'user-carol', 'clap');
    const hidden = await repos.content.promos.create({ playerId: alice.playerId, promoType: 'open-mic', content: 'hidden' });
    await repos.content.promos.update(hidden.promoId, { isHidden: true });
    await repos.content.promos.create({ playerId: 'someone-else', promoType: 'open-mic', content: 'x' });
    const bobPromo = await repos.content.promos.create({ playerId: bob.playerId, promoType: 'open-mic', content: 'b' });
    await repos.content.promos.addReaction(bobPromo.promoId, 'user-alice', 'trash');

    const expiresAt = '2027-01-01T00:00:00.000Z';
    await repos.user.challenges.create({ challengerId: alice.playerId, challengedId: bob.playerId, matchType: 'singles', expiresAt });
    const cancelled = await repos.user.challenges.create({ challengerId: alice.playerId, challengedId: carol.playerId, matchType: 'singles', expiresAt });
    await repos.user.challenges.update(cancelled.challengeId, { status: 'cancelled' });
    await repos.user.challenges.create({ challengerId: bob.playerId, challengedId: alice.playerId, matchType: 'singles', expiresAt });

    const listCompleted = vi.spyOn(repos.competition.matches, 'listCompleted');
    const listPromos = vi.spyOn(repos.content.promos, 'list');
    const listChallenges = vi.spyOn(repos.user.challenges, 'list');

    const batch = await loadProgressionBatch([alice.playerId, bob.playerId, 'ghost']);

    expect(listCompleted).toHaveBeenCalledTimes(1);
    expect(listPromos).toHaveBeenCalledTimes(1);
    expect(listChallenges).toHaveBeenCalledTimes(1);

    const aliceInputs = batch.inputs.get(alice.playerId)!;
    expect(aliceInputs.matches.map((m) => [m.matchId, m.result]).sort()).toEqual([['m1', 'win'], ['m2', 'draw']]);
    const m1 = aliceInputs.matches.find((m) => m.matchId === 'm1')!;
    expect(m1).toMatchObject({ seasonId: 's1', ratingAverage: 3.75, ratingsCount: 4, matchOfTheNight: true });
    // Falls back to starRating when there is no raw average.
    expect(aliceInputs.matches.find((m) => m.matchId === 'm2')!.ratingAverage).toBe(2.5);
    // Self-reaction from user-alice stripped; hidden promo excluded.
    expect(aliceInputs.promos).toHaveLength(1);
    expect(aliceInputs.promos[0].reactionCounts).toEqual({ fire: 1, clap: 1 });
    expect(aliceInputs.challenges).toHaveLength(1);

    const bobInputs = batch.inputs.get(bob.playerId)!;
    expect(bobInputs.matches.map((m) => [m.matchId, m.result]).sort()).toEqual([['m1', 'loss'], ['m2', 'draw']]);
    // Bob has no userId, so every reaction counts.
    expect(bobInputs.promos[0].reactionCounts).toEqual({ trash: 1 });
    expect(bobInputs.challenges).toHaveLength(1);

    expect(batch.inputs.get('ghost')).toEqual({ playerId: 'ghost', matches: [], promos: [], challenges: [] });
    expect(batch.inputs.has(carol.playerId)).toBe(false);
    expect([...batch.players.keys()].sort()).toEqual([alice.playerId, bob.playerId].sort());
    expect(batch.activeSeason).toBeNull();
  });

  it('loadProgressionInputs returns just the inputs map', async () => {
    const alice = await addPlayer('Alice');
    const season = await repos.season.seasons.create({ name: 'S1', startDate: '2026-01-01T00:00:00.000Z' });
    const result = await loadProgressionInputs([alice.playerId]);
    expect(result.get(alice.playerId)?.matches).toEqual([]);
    expect((await loadProgressionBatch([])).activeSeason?.seasonId).toBe(season.seasonId);
  });
});

describe('reactionCountsFromOthers', () => {
  it('counts every reaction when the author has no user id', () => {
    expect(reactionCountsFromOthers({ reactions: { u1: 'fire', u2: 'fire' } }, undefined)).toEqual({ fire: 2 });
  });

  it('tolerates a legacy promo with no reactions map', () => {
    expect(reactionCountsFromOthers({} as Pick<Promo, 'reactions'>, 'u1')).toEqual({});
  });
});

describe('window resolution', () => {
  const player = {
    playerId: 'p1',
    createdAt: '2026-01-01T00:00:00.000Z',
  } as Player;
  const season: Season = {
    seasonId: 's1',
    name: 'S1',
    startDate: '2026-02-01T00:00:00.000Z',
    status: 'active',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };

  it('divisionJoinedAt prefers divisionJoinedAt and falls back to createdAt', () => {
    expect(divisionJoinedAt(player)).toBe(player.createdAt);
    expect(divisionJoinedAt({ ...player, divisionJoinedAt: '' } as Player)).toBe(player.createdAt);
    expect(divisionJoinedAt({ ...player, divisionJoinedAt: '2026-05-01T00:00:00.000Z' } as Player)).toBe('2026-05-01T00:00:00.000Z');
  });

  it('resolves each mode', () => {
    expect(resolveProgressionWindow('allTime', player, season)).toEqual({ mode: 'allTime' });
    expect(resolveProgressionWindow('season', player, season)).toEqual({
      mode: 'season',
      seasonId: 's1',
      since: season.startDate,
      until: undefined,
    });
    expect(resolveProgressionWindow('season', player, null)).toEqual({ mode: 'season' });
    expect(resolveProgressionWindow('sinceJoinedDivision', player, null)).toEqual({
      mode: 'sinceJoinedDivision',
      since: player.createdAt,
    });
    expect(resolveProgressionWindow('sinceJoinedDivision', undefined, null)).toEqual({ mode: 'sinceJoinedDivision' });
  });
});
