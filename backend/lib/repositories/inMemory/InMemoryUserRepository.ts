import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type { FeatureFlags } from '../SiteConfigRepository';
import { DEFAULT_FEATURES } from '../SiteConfigRepository';
import type {
  UserRepository,
  NotificationPage,
  NotificationsMethods,
  ChallengeCreateInput,
  FantasyPickInput,
  WrestlerCostInitInput,
  FantasyMethods,
  SiteConfigMethods,
} from '../UserRepository';
import type {
  AppNotification,
  Challenge,
  ChallengeStatus,
  FantasyConfig,
  FantasyPick,
  WrestlerCost,
} from '../types';
import type { CrudRepository } from '../CrudRepository';

// ─── Notifications (direct implementation) ─────────────────────────

class NotificationsImpl implements NotificationsMethods {
  readonly store: AppNotification[] = [];

  async listByUser(userId: string, limit: number, cursor?: string): Promise<NotificationPage> {
    let items = this.store
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (cursor) {
      const idx = items.findIndex((n) => n.createdAt === cursor);
      if (idx >= 0) items = items.slice(idx + 1);
    }

    const page = items.slice(0, limit);
    return {
      notifications: page,
      nextCursor: page.length === limit && items.length > limit ? page[page.length - 1].createdAt : null,
    };
  }

  async countUnread(userId: string): Promise<number> {
    return this.store.filter((n) => n.userId === userId && !n.isRead).length;
  }

  async findByNotificationId(notificationId: string): Promise<AppNotification | null> {
    return this.store.find((n) => n.notificationId === notificationId) ?? null;
  }

  async markRead(userId: string, createdAt: string): Promise<void> {
    const item = this.store.find((n) => n.userId === userId && n.createdAt === createdAt);
    if (item) {
      item.isRead = true;
      item.updatedAt = new Date().toISOString();
    }
  }

  async markAllRead(userId: string): Promise<number> {
    const now = new Date().toISOString();
    let count = 0;
    for (const item of this.store) {
      if (item.userId === userId && !item.isRead) {
        item.isRead = true;
        item.updatedAt = now;
        count++;
      }
    }
    return count;
  }

  async delete(userId: string, createdAt: string): Promise<void> {
    const idx = this.store.findIndex((n) => n.userId === userId && n.createdAt === createdAt);
    if (idx >= 0) this.store.splice(idx, 1);
  }

  async deleteAllRead(userId: string): Promise<number> {
    const before = this.store.length;
    const remaining = this.store.filter((n) => !(n.userId === userId && n.isRead));
    const deleted = before - remaining.length;
    this.store.length = 0;
    this.store.push(...remaining);
    return deleted;
  }
}

// ─── Challenges (CRUD + query methods) ─────────────────────────────

type ChallengesCrudType = CrudRepository<Challenge, ChallengeCreateInput, Partial<Challenge>> & {
  listByStatus(status: ChallengeStatus): Promise<Challenge[]>;
  listByChallenger(playerId: string): Promise<Challenge[]>;
  listByChallenged(playerId: string): Promise<Challenge[]>;
  listByPlayer(playerId: string): Promise<Challenge[]>;
};

class ChallengesImpl implements ChallengesCrudType {
  readonly store = new Map<string, Challenge>();

  async findById(challengeId: string): Promise<Challenge | null> {
    return this.store.get(challengeId) ?? null;
  }

  async list(): Promise<Challenge[]> {
    const items = Array.from(this.store.values());
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return items;
  }

  async listByStatus(status: ChallengeStatus): Promise<Challenge[]> {
    return Array.from(this.store.values()).filter(
      (c) => c.status === status,
    );
  }

  async listByChallenger(playerId: string): Promise<Challenge[]> {
    return Array.from(this.store.values()).filter(
      (c) => c.challengerId === playerId,
    );
  }

  async listByChallenged(playerId: string): Promise<Challenge[]> {
    return Array.from(this.store.values()).filter(
      (c) => c.challengedId === playerId,
    );
  }

  async listByPlayer(playerId: string): Promise<Challenge[]> {
    const items = Array.from(this.store.values()).filter(
      (c) => c.challengerId === playerId || c.challengedId === playerId,
    );
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return items;
  }

  async create(input: ChallengeCreateInput): Promise<Challenge> {
    const now = new Date().toISOString();
    const item: Challenge = {
      challengeId: uuidv4(),
      challengerId: input.challengerId,
      challengedId: input.challengedId,
      matchType: input.matchType,
      ...(input.stipulation !== undefined ? { stipulation: input.stipulation } : {}),
      ...(input.championshipId !== undefined ? { championshipId: input.championshipId } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
      ...(input.challengeMode !== undefined ? { challengeMode: input.challengeMode } : {}),
      ...(input.challengerTagTeamId !== undefined ? { challengerTagTeamId: input.challengerTagTeamId } : {}),
      ...(input.challengedTagTeamId !== undefined ? { challengedTagTeamId: input.challengedTagTeamId } : {}),
      status: 'pending',
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.challengeId, item);
    return item;
  }

  async update(
    challengeId: string,
    patch: Partial<Challenge>,
  ): Promise<Challenge> {
    const existing = this.store.get(challengeId);
    if (!existing) throw new NotFoundError('Challenge', challengeId);
    const updated: Challenge = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(challengeId, updated);
    return updated;
  }

  async delete(challengeId: string): Promise<void> {
    this.store.delete(challengeId);
  }
}

// ─── Fantasy (direct implementation, 3 sub-entities) ───────────────

class FantasyImpl implements FantasyMethods {
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

// ─── Site Config (direct implementation) ───────────────────────────

class SiteConfigImpl implements SiteConfigMethods {
  features: FeatureFlags = { ...DEFAULT_FEATURES };

  async getFeatures(): Promise<FeatureFlags> {
    return { ...this.features };
  }

  async updateFeatures(patch: Partial<FeatureFlags>): Promise<FeatureFlags> {
    this.features = { ...this.features, ...patch };
    return { ...this.features };
  }
}

// ─── Aggregate ─────────────────────────────────────────────────────

export class InMemoryUserRepository implements UserRepository {
  readonly notifications: NotificationsImpl;
  readonly challenges: ChallengesImpl;
  readonly fantasy: FantasyImpl;
  readonly siteConfig: SiteConfigImpl;

  /** Exposed for InMemoryUnitOfWork -- the Map<string, Challenge> backing the challenges store. */
  get challengesStore(): Map<string, Challenge> {
    return this.challenges.store;
  }

  constructor() {
    this.notifications = new NotificationsImpl();
    this.challenges = new ChallengesImpl();
    this.fantasy = new FantasyImpl();
    this.siteConfig = new SiteConfigImpl();
  }
}
