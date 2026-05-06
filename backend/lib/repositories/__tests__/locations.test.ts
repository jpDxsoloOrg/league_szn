import { describe, it, expect, beforeEach } from 'vitest';

import { InMemoryLeagueOpsRepository } from '../inMemory/InMemoryLeagueOpsRepository';
import type { LocationsMethods } from '../LeagueOpsRepository';

describe('InMemoryLeagueOpsRepository.locations', () => {
  let repo: LocationsMethods;

  beforeEach(() => {
    repo = new InMemoryLeagueOpsRepository().locations;
  });

  describe('create', () => {
    it('persists required + optional fields and stamps timestamps', async () => {
      const created = await repo.create({
        name: 'Madison Square Garden',
        city: 'New York',
        capacity: 20000,
      });

      expect(created.locationId).toBeDefined();
      expect(created.name).toBe('Madison Square Garden');
      expect(created.city).toBe('New York');
      expect(created.capacity).toBe(20000);
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
    });
  });

  describe('bulkImport', () => {
    it('creates all rows when names are unique', async () => {
      const result = await repo.bulkImport([
        { name: 'MSG' },
        { name: 'Allstate Arena' },
        { name: 'T-Mobile Arena' },
      ]);

      expect(result.created).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.skippedNames).toEqual([]);
      const all = await repo.list();
      expect(all).toHaveLength(3);
    });

    it('dedupes within the request by case-insensitive name', async () => {
      const result = await repo.bulkImport([
        { name: 'MSG' },
        { name: 'msg' },
        { name: 'Msg' },
      ]);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(2);
      expect(result.skippedNames).toEqual(['msg', 'Msg']);
    });

    it('skips rows whose name already exists in the table', async () => {
      await repo.create({ name: 'MSG' });

      const result = await repo.bulkImport([
        { name: 'MSG' },
        { name: 'msg' },
        { name: 'Allstate Arena' },
      ]);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(2);
      expect(result.skippedNames).toEqual(['MSG', 'msg']);
      const all = await repo.list();
      expect(all).toHaveLength(2);
    });

    it('handles >100 rows in a single call', async () => {
      const inputs = Array.from({ length: 250 }, (_, i) => ({ name: `Venue ${i}` }));
      const result = await repo.bulkImport(inputs);

      expect(result.created).toBe(250);
      expect(result.skipped).toBe(0);
      const all = await repo.list();
      expect(all).toHaveLength(250);
    });

    it('returns counts of zero for an empty input', async () => {
      const result = await repo.bulkImport([]);
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(0);
    });
  });
});
