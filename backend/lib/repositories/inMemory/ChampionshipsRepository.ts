import type { ChampionshipsRepository } from '../ChampionshipsRepository';
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
}
