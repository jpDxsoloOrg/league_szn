import type { ChampionshipsRepository, ChampionshipPatch } from '../ChampionshipsRepository';
import { NotFoundError } from '../errors';
import type { Championship, ChampionshipHistoryEntry } from '../types';

export class InMemoryChampionshipsRepository implements ChampionshipsRepository {
  readonly store = new Map<string, Championship>();
  readonly historyStore: ChampionshipHistoryEntry[] = [];

  async findById(championshipId: string): Promise<Championship | null> {
    return this.store.get(championshipId) ?? null;
  }

  async list(): Promise<Championship[]> {
    return Array.from(this.store.values());
  }

  async listActive(): Promise<Championship[]> {
    return Array.from(this.store.values()).filter((c) => c.isActive !== false);
  }

  async listHistory(championshipId: string): Promise<ChampionshipHistoryEntry[]> {
    return this.historyStore.filter((h) => h.championshipId === championshipId);
  }

  async listAllHistory(): Promise<ChampionshipHistoryEntry[]> {
    return [...this.historyStore];
  }

  async findCurrentReign(championshipId: string): Promise<ChampionshipHistoryEntry | null> {
    const reigns = this.historyStore
      .filter((h) => h.championshipId === championshipId && !h.lostDate)
      .sort((a, b) => new Date(b.wonDate).getTime() - new Date(a.wonDate).getTime());
    return reigns[0] ?? null;
  }

  async update(championshipId: string, patch: ChampionshipPatch): Promise<Championship> {
    const existing = this.store.get(championshipId);
    if (!existing) throw new NotFoundError('Championship', championshipId);
    const { currentChampion, ...rest } = patch;
    const updated: Championship = { ...existing, ...rest, updatedAt: new Date().toISOString() };
    if (currentChampion === null) {
      delete (updated as Partial<Championship>).currentChampion;
    } else if (currentChampion !== undefined) {
      updated.currentChampion = currentChampion;
    }
    this.store.set(championshipId, updated);
    return updated;
  }

  async removeChampion(championshipId: string): Promise<Championship> {
    const existing = this.store.get(championshipId);
    if (!existing) throw new NotFoundError('Championship', championshipId);
    delete (existing as Partial<Championship>).currentChampion;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  async closeReign(championshipId: string, wonDate: string, lostDate: string, daysHeld: number): Promise<void> {
    const reign = this.historyStore.find(
      (h) => h.championshipId === championshipId && h.wonDate === wonDate,
    );
    if (reign) {
      reign.lostDate = lostDate;
      reign.daysHeld = daysHeld;
    }
  }

  async reopenReign(championshipId: string, wonDate: string): Promise<void> {
    const reign = this.historyStore.find(
      (h) => h.championshipId === championshipId && h.wonDate === wonDate,
    );
    if (reign) {
      delete reign.lostDate;
      delete reign.daysHeld;
    }
  }

  async deleteHistoryEntry(championshipId: string, wonDate: string): Promise<void> {
    const index = this.historyStore.findIndex(
      (h) => h.championshipId === championshipId && h.wonDate === wonDate,
    );
    if (index !== -1) {
      this.historyStore.splice(index, 1);
    }
  }

  async incrementDefenses(championshipId: string, wonDate: string): Promise<void> {
    const reign = this.historyStore.find(
      (h) => h.championshipId === championshipId && h.wonDate === wonDate,
    );
    if (reign) {
      reign.defenses = (reign.defenses ?? 0) + 1;
    }
  }

  async decrementDefenses(championshipId: string, wonDate: string): Promise<void> {
    const reign = this.historyStore.find(
      (h) => h.championshipId === championshipId && h.wonDate === wonDate,
    );
    if (reign) {
      reign.defenses = (reign.defenses ?? 0) - 1;
    }
  }
}
