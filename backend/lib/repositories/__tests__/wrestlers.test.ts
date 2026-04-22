import { describe, it, expect, beforeEach } from 'vitest';

import { InMemoryRosterRepository } from '../inMemory/InMemoryRosterRepository';
import type { WrestlersMethods } from '../RosterRepository';
import type { WrestlerCreateInput } from '../types';

describe('InMemoryRosterRepository.wrestlers', () => {
  let repo: WrestlersMethods;

  beforeEach(() => {
    repo = new InMemoryRosterRepository().wrestlers;
  });

  describe('create', () => {
    it('sets default isInUse=false, generates wrestlerId + timestamps', async () => {
      const created = await repo.create({
        promotion: 'WWE',
        name: 'Cody Rhodes',
        overallCap: 92,
      });

      expect(created.wrestlerId).toBeDefined();
      expect(created.wrestlerId.length).toBeGreaterThan(0);
      expect(created.isInUse).toBe(false);
      expect(created.promotion).toBe('WWE');
      expect(created.name).toBe('Cody Rhodes');
      expect(created.overallCap).toBe(92);
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
      expect(new Date(created.createdAt).toString()).not.toBe('Invalid Date');
      expect(new Date(created.updatedAt).toString()).not.toBe('Invalid Date');
    });
  });

  describe('update', () => {
    it('allows flipping isInUse to true without error', async () => {
      const created = await repo.create({
        promotion: 'WWE',
        name: 'Jey Uso',
        overallCap: 88,
      });

      const updated = await repo.update(created.wrestlerId, { isInUse: true });
      expect(updated.isInUse).toBe(true);
      expect(updated.wrestlerId).toBe(created.wrestlerId);
    });
  });

  describe('listByPromotion', () => {
    it('returns only wrestlers matching the promotion', async () => {
      await repo.create({ promotion: 'WWE', name: 'Roman Reigns', overallCap: 93 });
      await repo.create({ promotion: 'WWE', name: 'Seth Rollins', overallCap: 91 });
      await repo.create({ promotion: 'AEW', name: 'Kenny Omega', overallCap: 92 });
      await repo.create({ promotion: 'NJPW', name: 'Hiroshi Tanahashi', overallCap: 89 });

      const wwe = await repo.listByPromotion('WWE');
      expect(wwe).toHaveLength(2);
      expect(wwe.every((w) => w.promotion === 'WWE')).toBe(true);

      const aew = await repo.listByPromotion('AEW');
      expect(aew).toHaveLength(1);
      expect(aew[0].name).toBe('Kenny Omega');

      const tna = await repo.listByPromotion('TNA');
      expect(tna).toHaveLength(0);
    });
  });

  describe('listAvailable', () => {
    it('filters out wrestlers where isInUse=true', async () => {
      const a = await repo.create({ promotion: 'WWE', name: 'Available One', overallCap: 85 });
      const b = await repo.create({ promotion: 'AEW', name: 'Busy One', overallCap: 86 });
      await repo.create({ promotion: 'WCW', name: 'Available Two', overallCap: 84 });

      await repo.update(b.wrestlerId, { isInUse: true });

      const available = await repo.listAvailable();
      expect(available).toHaveLength(2);
      expect(available.every((w) => !w.isInUse)).toBe(true);
      const names = available.map((w) => w.name).sort();
      expect(names).toEqual(['Available One', 'Available Two']);

      // Sanity: the one we marked inUse is not in the result.
      expect(available.find((w) => w.wrestlerId === a.wrestlerId)).toBeDefined();
      expect(available.find((w) => w.wrestlerId === b.wrestlerId)).toBeUndefined();
    });
  });

  describe('findByName', () => {
    it('is case-insensitive on the name argument', async () => {
      await repo.create({ promotion: 'WWE', name: 'Cody Rhodes', overallCap: 92 });

      const lower = await repo.findByName('WWE', 'cody rhodes');
      expect(lower).not.toBeNull();
      expect(lower?.name).toBe('Cody Rhodes');

      const upper = await repo.findByName('WWE', 'CODY RHODES');
      expect(upper).not.toBeNull();
      expect(upper?.name).toBe('Cody Rhodes');

      const mixed = await repo.findByName('WWE', 'cOdY rHoDeS');
      expect(mixed).not.toBeNull();
    });

    it('scopes by promotion — same name in a different promotion does not match', async () => {
      await repo.create({ promotion: 'WWE', name: 'Clone Name', overallCap: 80 });
      await repo.create({ promotion: 'AEW', name: 'Clone Name', overallCap: 80 });

      const wwe = await repo.findByName('WWE', 'clone name');
      expect(wwe?.promotion).toBe('WWE');

      const njpw = await repo.findByName('NJPW', 'clone name');
      expect(njpw).toBeNull();
    });

    it('returns null when no match exists', async () => {
      const result = await repo.findByName('WWE', 'Not A Real Wrestler');
      expect(result).toBeNull();
    });
  });

  describe('bulkCreate', () => {
    it('creates all valid rows and reports created count', async () => {
      const result = await repo.bulkCreate([
        { promotion: 'WWE', name: 'A', overallCap: 80 },
        { promotion: 'WWE', name: 'B', overallCap: 81 },
        { promotion: 'AEW', name: 'C', overallCap: 82 },
      ]);

      expect(result.created).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      const all = await repo.list();
      expect(all).toHaveLength(3);
    });

    it('dedupes duplicates within the payload (case-insensitive on name)', async () => {
      const result = await repo.bulkCreate([
        { promotion: 'WWE', name: 'Cody Rhodes', overallCap: 92 },
        { promotion: 'WWE', name: 'cody rhodes', overallCap: 92 },
        { promotion: 'WWE', name: 'CODY RHODES', overallCap: 92 },
      ]);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].row).toBe(1);
      expect(result.errors[1].row).toBe(2);
      expect(result.errors[0].reason).toMatch(/duplicate/i);
    });

    it('dedupes against existing wrestlers already in the repo', async () => {
      await repo.create({ promotion: 'WWE', name: 'Roman Reigns', overallCap: 93 });

      const result = await repo.bulkCreate([
        { promotion: 'WWE', name: 'ROMAN REIGNS', overallCap: 93 },
        { promotion: 'WWE', name: 'Seth Rollins', overallCap: 91 },
      ]);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(0);
      expect(result.errors[0].reason).toMatch(/already exists/);
    });

    it('reports per-row errors for invalid promotion', async () => {
      const inputs = [
        { promotion: 'WWE', name: 'Valid One', overallCap: 80 },
        { promotion: 'IMPACT', name: 'Bad Promotion', overallCap: 80 },
      ] as unknown as WrestlerCreateInput[];

      const result = await repo.bulkCreate(inputs);

      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(1);
      expect(result.errors[0].reason).toMatch(/promotion/i);
    });

    it('reports per-row errors for out-of-range overallCap', async () => {
      const inputs: WrestlerCreateInput[] = [
        { promotion: 'WWE', name: 'Too Low', overallCap: 69 },
        { promotion: 'WWE', name: 'Too High', overallCap: 94 },
        { promotion: 'WWE', name: 'Not Integer', overallCap: 80.5 },
        { promotion: 'WWE', name: 'Just Right', overallCap: 80 },
      ];

      const result = await repo.bulkCreate(inputs);

      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(3);
      expect(result.errors.map((e) => e.row).sort()).toEqual([0, 1, 2]);
      for (const err of result.errors) {
        expect(err.reason).toMatch(/overallCap/i);
      }
    });

    it('reports per-row errors for missing or blank names', async () => {
      const inputs = [
        { promotion: 'WWE', name: '', overallCap: 80 },
        { promotion: 'WWE', name: '   ', overallCap: 80 },
        { promotion: 'WWE', overallCap: 80 } as unknown as WrestlerCreateInput,
        { promotion: 'WWE', name: 'Valid', overallCap: 80 },
      ] as WrestlerCreateInput[];

      const result = await repo.bulkCreate(inputs);

      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(3);
      expect(result.errors.map((e) => e.row).sort()).toEqual([0, 1, 2]);
      for (const err of result.errors) {
        expect(err.reason).toMatch(/name/i);
      }
    });
  });
});
