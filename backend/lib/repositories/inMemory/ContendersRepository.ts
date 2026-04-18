import type {
  ContenderRankingInput,
  ContenderOverrideInput,
  RankingHistoryInput,
  ContendersRepository,
} from '../ContendersRepository';
import type { ContenderRanking, ContenderOverride, RankingHistoryEntry } from '../types';

export class InMemoryContendersRepository implements ContendersRepository {
  readonly rankings = new Map<string, ContenderRanking>();
  readonly overrides = new Map<string, ContenderOverride>();
  readonly history = new Map<string, RankingHistoryEntry>();

  private rankingKey(championshipId: string, playerId: string): string {
    return `${championshipId}#${playerId}`;
  }

  private historyKey(playerId: string, weekKey: string): string {
    return `${playerId}#${weekKey}`;
  }

  // ── Rankings ──────────────────────────────────────────────────────

  async listByChampionship(championshipId: string): Promise<ContenderRanking[]> {
    return Array.from(this.rankings.values()).filter(
      (r) => r.championshipId === championshipId,
    );
  }

  async listByChampionshipRanked(championshipId: string): Promise<ContenderRanking[]> {
    const items = await this.listByChampionship(championshipId);
    items.sort((a, b) => a.rank - b.rank);
    return items;
  }

  async deleteAllForChampionship(championshipId: string): Promise<void> {
    for (const [key, ranking] of this.rankings) {
      if (ranking.championshipId === championshipId) {
        this.rankings.delete(key);
      }
    }
  }

  async upsertRanking(input: ContenderRankingInput): Promise<ContenderRanking> {
    const now = new Date().toISOString();
    const item: ContenderRanking = {
      championshipId: input.championshipId,
      playerId: input.playerId,
      rank: input.rank,
      rankingScore: input.rankingScore,
      winPercentage: input.winPercentage,
      currentStreak: input.currentStreak,
      qualityScore: input.qualityScore,
      recencyScore: input.recencyScore,
      matchesInPeriod: input.matchesInPeriod,
      winsInPeriod: input.winsInPeriod,
      previousRank: input.previousRank ?? null,
      peakRank: input.peakRank,
      weeksAtTop: input.weeksAtTop,
      isOverridden: input.isOverridden || false,
      overrideType: input.overrideType || null,
      organicRank: input.organicRank || null,
      calculatedAt: now,
      updatedAt: now,
    };

    this.rankings.set(this.rankingKey(input.championshipId, input.playerId), item);
    return item;
  }

  // ── Overrides ─────────────────────────────────────────────────────

  async findOverride(
    championshipId: string,
    playerId: string,
  ): Promise<ContenderOverride | null> {
    return this.overrides.get(this.rankingKey(championshipId, playerId)) ?? null;
  }

  async listActiveOverrides(championshipId?: string): Promise<ContenderOverride[]> {
    return Array.from(this.overrides.values()).filter((o) => {
      if (!o.active) return false;
      if (championshipId && o.championshipId !== championshipId) return false;
      return true;
    });
  }

  async createOverride(input: ContenderOverrideInput): Promise<ContenderOverride> {
    const now = new Date().toISOString();
    const item: ContenderOverride = {
      championshipId: input.championshipId,
      playerId: input.playerId,
      overrideType: input.overrideType,
      reason: input.reason,
      createdBy: input.createdBy,
      createdAt: now,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      active: true,
    };

    this.overrides.set(this.rankingKey(input.championshipId, input.playerId), item);
    return item;
  }

  async deactivateOverride(
    championshipId: string,
    playerId: string,
    reason: string,
  ): Promise<void> {
    const key = this.rankingKey(championshipId, playerId);
    const existing = this.overrides.get(key);
    if (existing) {
      this.overrides.set(key, {
        ...existing,
        active: false,
        removedAt: new Date().toISOString(),
        removedReason: reason,
      });
    }
  }

  // ── Ranking history ───────────────────────────────────────────────

  async writeHistory(input: RankingHistoryInput): Promise<RankingHistoryEntry> {
    const now = new Date().toISOString();
    const item: RankingHistoryEntry = {
      playerId: input.playerId,
      weekKey: input.weekKey,
      championshipId: input.championshipId,
      rank: input.rank,
      rankingScore: input.rankingScore,
      movement: input.movement,
      isOverridden: input.isOverridden || false,
      overrideType: input.overrideType || null,
      organicRank: input.organicRank || null,
      createdAt: now,
    };

    this.history.set(this.historyKey(input.playerId, input.weekKey), item);
    return item;
  }
}
