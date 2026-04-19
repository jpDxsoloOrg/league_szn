import type { CrudRepository } from './CrudRepository';
import type {
  Announcement,
  Video,
  Promo,
  PromoType,
  ReactionType,
  StorylineRequest,
  StorylineRequestStatus,
} from './types';

// ─── Announcement input types ───────────────────────────────────────

export interface AnnouncementCreateInput {
  title: string;
  body: string;
  priority?: number;
  isActive?: boolean;
  expiresAt?: string;
  videoUrl?: string;
  createdBy: string;
}

export interface AnnouncementPatch {
  title?: string;
  body?: string;
  priority?: number;
  isActive?: boolean;
  expiresAt?: string | null;
}

// ─── Video input types ──────────────────────────────────────────────

export interface VideoCreateInput {
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  category: 'match' | 'highlight' | 'promo' | 'other';
  tags?: string[];
  isPublished?: boolean;
  uploadedBy: string;
}

export interface VideoPatch {
  title?: string;
  description?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  category?: 'match' | 'highlight' | 'promo' | 'other';
  tags?: string[];
  isPublished?: boolean;
}

// ─── Promo input types ──────────────────────────────────────────────

export interface PromoCreateInput {
  playerId: string;
  promoType: PromoType;
  title?: string;
  content: string;
  targetPlayerId?: string;
  targetPromoId?: string;
  matchId?: string;
  championshipId?: string;
  imageUrl?: string;
  challengeMode?: 'singles' | 'tag_team';
  challengerTagTeamName?: string;
  targetTagTeamName?: string;
}

// ─── Storyline Request input types ──────────────────────────────────

export interface StorylineRequestCreateInput {
  requesterId: string;
  targetPlayerIds: string[];
  requestType: 'storyline' | 'backstage_attack' | 'rivalry';
  description: string;
}

export interface StorylineRequestReviewInput {
  status: 'acknowledged' | 'declined';
  reviewedBy: string;
  gmNote?: string;
}

// ─── Sub-interfaces ─────────────────────────────────────────────────

export interface PromosMethods {
  findById(promoId: string): Promise<Promo | null>;
  list(): Promise<Promo[]>;
  listByPlayer(playerId: string): Promise<Promo[]>;
  listByType(promoType: PromoType): Promise<Promo[]>;
  listResponsesTo(targetPromoId: string): Promise<Promo[]>;
  create(input: PromoCreateInput): Promise<Promo>;
  update(promoId: string, patch: Partial<Promo>): Promise<Promo>;
  delete(promoId: string): Promise<void>;
  addReaction(promoId: string, userId: string, reaction: ReactionType): Promise<Promo>;
  removeReaction(promoId: string, userId: string): Promise<Promo>;
}

export interface StorylineRequestsMethods {
  findById(requestId: string): Promise<StorylineRequest | null>;
  list(): Promise<StorylineRequest[]>;
  listByStatus(status: StorylineRequestStatus): Promise<StorylineRequest[]>;
  listByRequester(requesterId: string): Promise<StorylineRequest[]>;
  create(input: StorylineRequestCreateInput): Promise<StorylineRequest>;
  review(requestId: string, input: StorylineRequestReviewInput): Promise<StorylineRequest>;
}

// ─── Aggregate interface ────────────────────────────────────────────

export interface ContentRepository {
  announcements: CrudRepository<Announcement, AnnouncementCreateInput, AnnouncementPatch> & {
    listActive(): Promise<Announcement[]>;
  };
  videos: CrudRepository<Video, VideoCreateInput, VideoPatch> & {
    listPublished(category?: string): Promise<Video[]>;
  };
  promos: PromosMethods;
  storylineRequests: StorylineRequestsMethods;
}
