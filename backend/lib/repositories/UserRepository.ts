import type { CrudRepository } from './CrudRepository';
import type {
  AppNotification,
  Challenge,
  ChallengeStatus,
  FantasyConfig,
  FantasyPick,
  WrestlerCost,
} from './types';
import type { FeatureFlags } from './SiteConfigRepository';

// ─── Notification types ─────────────────────────────────────────────

export interface NotificationPage {
  notifications: AppNotification[];
  nextCursor: string | null;
}

// ─── Challenge input types ──────────────────────────────────────────

export interface ChallengeCreateInput {
  challengerId: string;
  challengedId: string;
  matchType: string;
  stipulation?: string;
  championshipId?: string;
  message?: string;
  challengeMode?: 'singles' | 'tag_team';
  challengerTagTeamId?: string;
  challengedTagTeamId?: string;
  expiresAt: string;
}

// ─── Fantasy input types ────────────────────────────────────────────

export interface FantasyPickInput {
  eventId: string;
  fantasyUserId: string;
  username?: string;
  picks: Record<string, string[]>;
  totalSpent?: number;
}

export interface WrestlerCostInitInput {
  playerId: string;
  baseCost: number;
}

// ─── Sub-interfaces ─────────────────────────────────────────────────

export interface NotificationsMethods {
  listByUser(userId: string, limit: number, cursor?: string): Promise<NotificationPage>;
  countUnread(userId: string): Promise<number>;
  findByNotificationId(notificationId: string): Promise<AppNotification | null>;
  markRead(userId: string, createdAt: string): Promise<void>;
  markAllRead(userId: string): Promise<number>;
  delete(userId: string, createdAt: string): Promise<void>;
  deleteAllRead(userId: string): Promise<number>;
}

export interface FantasyMethods {
  // Config
  getConfig(): Promise<FantasyConfig | null>;
  upsertConfig(config: Partial<FantasyConfig>): Promise<FantasyConfig>;

  // Picks
  findPick(eventId: string, fantasyUserId: string): Promise<FantasyPick | null>;
  listPicksByEvent(eventId: string): Promise<FantasyPick[]>;
  listPicksByUser(fantasyUserId: string): Promise<FantasyPick[]>;
  listAllPicks(): Promise<FantasyPick[]>;
  savePick(input: FantasyPickInput, existingCreatedAt?: string): Promise<FantasyPick>;
  updatePickScoring(
    eventId: string,
    fantasyUserId: string,
    pointsEarned: number,
    breakdown: Record<string, unknown>,
  ): Promise<void>;
  deletePick(eventId: string, fantasyUserId: string): Promise<void>;

  // Wrestler costs
  findCost(playerId: string): Promise<WrestlerCost | null>;
  listAllCosts(): Promise<WrestlerCost[]>;
  upsertCost(cost: WrestlerCost): Promise<WrestlerCost>;
  initializeCost(input: WrestlerCostInitInput): Promise<WrestlerCost>;
}

export interface SiteConfigMethods {
  getFeatures(): Promise<FeatureFlags>;
  updateFeatures(patch: Partial<FeatureFlags>): Promise<FeatureFlags>;
}

// ─── Aggregate interface ────────────────────────────────────────────

export interface UserRepository {
  notifications: NotificationsMethods;
  challenges: CrudRepository<Challenge, ChallengeCreateInput, Partial<Challenge>> & {
    listByStatus(status: ChallengeStatus): Promise<Challenge[]>;
    listByChallenger(playerId: string): Promise<Challenge[]>;
    listByChallenged(playerId: string): Promise<Challenge[]>;
    listByPlayer(playerId: string): Promise<Challenge[]>;
  };
  fantasy: FantasyMethods;
  siteConfig: SiteConfigMethods;
}
