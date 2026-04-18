import { v4 as uuidv4 } from 'uuid';
import type {
  SeasonAwardCreateInput,
  SeasonAwardsRepository,
} from '../SeasonAwardsRepository';
import type { SeasonAward } from '../types';

export class InMemorySeasonAwardsRepository implements SeasonAwardsRepository {
  readonly store = new Map<string, SeasonAward>();

  private key(seasonId: string, awardId: string): string {
    return `${seasonId}#${awardId}`;
  }

  async listBySeason(seasonId: string): Promise<SeasonAward[]> {
    return Array.from(this.store.values()).filter((a) => a.seasonId === seasonId);
  }

  async findById(seasonId: string, awardId: string): Promise<SeasonAward | null> {
    return this.store.get(this.key(seasonId, awardId)) ?? null;
  }

  async create(input: SeasonAwardCreateInput): Promise<SeasonAward> {
    const now = new Date().toISOString();
    const item: SeasonAward = {
      awardId: uuidv4(),
      seasonId: input.seasonId,
      name: input.name,
      awardType: input.awardType,
      playerId: input.playerId,
      playerName: input.playerName,
      description: input.description ?? null,
      createdAt: now,
    };
    this.store.set(this.key(item.seasonId, item.awardId), item);
    return item;
  }

  async delete(seasonId: string, awardId: string): Promise<void> {
    this.store.delete(this.key(seasonId, awardId));
  }

  async deleteAllForSeason(seasonId: string): Promise<number> {
    const items = await this.listBySeason(seasonId);
    for (const award of items) {
      this.store.delete(this.key(seasonId, award.awardId));
    }
    return items.length;
  }
}
