import type {
  FantasyPickInput,
  WrestlerCostInitInput,
  FantasyRepository,
} from '../FantasyRepository';
import type { FantasyConfig, FantasyPick, WrestlerCost } from '../types';

export class InMemoryFantasyRepository implements FantasyRepository {
  readonly configs = new Map<string, FantasyConfig>();
  readonly picks = new Map<string, FantasyPick>();
  readonly costs = new Map<string, WrestlerCost>();

  private pickKey(eventId: string, fantasyUserId: string): string {
    return `${eventId}#${fantasyUserId}`;
  }

  // ── Config ────────────────────────────────────────────────────────

  async getConfig(): Promise<FantasyConfig | null> {
    return this.configs.get('GLOBAL') ?? null;
  }

  async upsertConfig(patch: Partial<FantasyConfig>): Promise<FantasyConfig> {
    const existing = this.configs.get('GLOBAL');
    const updated: FantasyConfig = {
      ...(existing || {}),
      ...patch,
      configKey: 'GLOBAL',
    } as FantasyConfig;

    this.configs.set('GLOBAL', updated);
    return updated;
  }

  // ── Picks ─────────────────────────────────────────────────────────

  async findPick(eventId: string, fantasyUserId: string): Promise<FantasyPick | null> {
    return this.picks.get(this.pickKey(eventId, fantasyUserId)) ?? null;
  }

  async listPicksByEvent(eventId: string): Promise<FantasyPick[]> {
    return Array.from(this.picks.values()).filter(
      (p) => p.eventId === eventId,
    );
  }

  async listPicksByUser(fantasyUserId: string): Promise<FantasyPick[]> {
    const items = Array.from(this.picks.values()).filter(
      (p) => p.fantasyUserId === fantasyUserId,
    );
    items.sort((a, b) => b.eventId.localeCompare(a.eventId));
    return items;
  }

  async listAllPicks(): Promise<FantasyPick[]> {
    return Array.from(this.picks.values());
  }

  async savePick(input: FantasyPickInput, existingCreatedAt?: string): Promise<FantasyPick> {
    const timestamp = new Date().toISOString();
    const item: FantasyPick = {
      eventId: input.eventId,
      fantasyUserId: input.fantasyUserId,
      username: input.username,
      picks: input.picks,
      totalSpent: input.totalSpent,
      createdAt: existingCreatedAt || timestamp,
      updatedAt: timestamp,
    };

    this.picks.set(this.pickKey(input.eventId, input.fantasyUserId), item);
    return item;
  }

  async updatePickScoring(
    eventId: string,
    fantasyUserId: string,
    pointsEarned: number,
    breakdown: Record<string, unknown>,
  ): Promise<void> {
    const key = this.pickKey(eventId, fantasyUserId);
    const existing = this.picks.get(key);
    if (existing) {
      this.picks.set(key, {
        ...existing,
        pointsEarned,
        breakdown: breakdown as FantasyPick['breakdown'],
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async deletePick(eventId: string, fantasyUserId: string): Promise<void> {
    this.picks.delete(this.pickKey(eventId, fantasyUserId));
  }

  // ── Wrestler costs ────────────────────────────────────────────────

  async findCost(playerId: string): Promise<WrestlerCost | null> {
    return this.costs.get(playerId) ?? null;
  }

  async listAllCosts(): Promise<WrestlerCost[]> {
    return Array.from(this.costs.values());
  }

  async upsertCost(cost: WrestlerCost): Promise<WrestlerCost> {
    this.costs.set(cost.playerId, cost);
    return cost;
  }

  async initializeCost(input: WrestlerCostInitInput): Promise<WrestlerCost> {
    const timestamp = new Date().toISOString();
    const today = timestamp.split('T')[0];
    const item: WrestlerCost = {
      playerId: input.playerId,
      currentCost: input.baseCost,
      baseCost: input.baseCost,
      costHistory: [{ date: today, cost: input.baseCost, reason: 'Initialized' }],
      winRate30Days: 0,
      recentRecord: '0-0',
      updatedAt: timestamp,
    };

    this.costs.set(input.playerId, item);
    return item;
  }
}
