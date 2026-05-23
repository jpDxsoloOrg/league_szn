import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryMatchRatingsRepository } from '../InMemoryMatchRatingsRepository';
import { RatingAlreadyExistsError } from '../../matchRatings';

describe('InMemoryMatchRatingsRepository', () => {
  let repo: InMemoryMatchRatingsRepository;

  beforeEach(() => {
    repo = new InMemoryMatchRatingsRepository();
  });

  it('persists a new rating and returns it with createdAt set', async () => {
    const created = await repo.create({
      matchId: 'm-1',
      userId: 'u-alice',
      rating: 4.5,
    });
    expect(created.matchId).toBe('m-1');
    expect(created.userId).toBe('u-alice');
    expect(created.rating).toBe(4.5);
    expect(typeof created.createdAt).toBe('string');
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('rejects a duplicate rating for the same (matchId, userId)', async () => {
    await repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 4 });
    await expect(
      repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 5 }),
    ).rejects.toBeInstanceOf(RatingAlreadyExistsError);
  });

  it('allows the same user to rate a different match', async () => {
    await repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 4 });
    const second = await repo.create({
      matchId: 'm-2',
      userId: 'u-alice',
      rating: 3,
    });
    expect(second.matchId).toBe('m-2');
  });

  it('allows a different user to rate the same match', async () => {
    await repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 4 });
    const second = await repo.create({
      matchId: 'm-1',
      userId: 'u-bob',
      rating: 2,
    });
    expect(second.userId).toBe('u-bob');
  });

  it('getByMatch returns every rating for one match', async () => {
    await repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 4 });
    await repo.create({ matchId: 'm-1', userId: 'u-bob', rating: 3 });
    await repo.create({ matchId: 'm-2', userId: 'u-alice', rating: 5 });

    const rows = await repo.getByMatch('m-1');
    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.userId).sort();
    expect(ids).toEqual(['u-alice', 'u-bob']);
  });

  it('getByMatch returns an empty array when no ratings exist', async () => {
    const rows = await repo.getByMatch('m-missing');
    expect(rows).toEqual([]);
  });

  it('findByMatchAndUser returns null when absent', async () => {
    const found = await repo.findByMatchAndUser('m-1', 'u-ghost');
    expect(found).toBeNull();
  });

  it('findByMatchAndUser returns the row when present', async () => {
    await repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 4 });
    const found = await repo.findByMatchAndUser('m-1', 'u-alice');
    expect(found).not.toBeNull();
    expect(found?.rating).toBe(4);
  });

  it('getByMatchIdsForUser returns only the matching rows', async () => {
    await repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 4 });
    await repo.create({ matchId: 'm-2', userId: 'u-alice', rating: 5 });
    await repo.create({ matchId: 'm-3', userId: 'u-alice', rating: 2 });
    await repo.create({ matchId: 'm-1', userId: 'u-bob', rating: 3 });

    const rows = await repo.getByMatchIdsForUser(['m-1', 'm-2', 'm-missing'], 'u-alice');
    const ids = rows.map((r) => r.matchId).sort();
    expect(ids).toEqual(['m-1', 'm-2']);
    // Filters to this user, not someone else's rating on m-1.
    expect(rows.every((r) => r.userId === 'u-alice')).toBe(true);
  });

  it('getByMatchIdsForUser returns [] for an empty input list', async () => {
    await repo.create({ matchId: 'm-1', userId: 'u-alice', rating: 4 });
    const rows = await repo.getByMatchIdsForUser([], 'u-alice');
    expect(rows).toEqual([]);
  });
});
