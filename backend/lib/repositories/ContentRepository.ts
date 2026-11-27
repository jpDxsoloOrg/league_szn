import type { CrudRepository } from './CrudRepository';
import type {
  Announcement,
  TickerMessage,
  Video,
  Episode,
  Promo,
  PromoType,
  ReactionType,
  StorylineRequest,
  StorylineRequestStatus,
} from './types';

// ─── Announcement input types ───────────────────────────────────────

/** Order of the popup queue: highest priority, then newest, so a new post is not behind older ones. */
export const compareActiveAnnouncements = (a: Announcement, b: Announcement): number =>
  (b.priority ?? 1) - (a.priority ?? 1) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

export interface AnnouncementCreateInput {
  title: string;
  body: string;
  priority?: number;
  isActive?: boolean;
  expiresAt?: string;
  videoUrl?: string;
  showAsPopup?: boolean;
  createdBy: string;
}

export interface AnnouncementPatch {
  title?: string;
  body?: string;
  priority?: number;
  isActive?: boolean;
  expiresAt?: string | null;
  showAsPopup?: boolean;
}

// ─── Ticker message types ───────────────────────────────────────────

/** Discriminator on Announcements-table rows that hold ticker messages. */
export const TICKER_KIND = 'ticker';

export const TICKER_TEXT_MAX_LENGTH = 140;

export interface TickerMessageCreateInput {
  text: string;
  href?: string;
  pinned?: boolean;
  startsAt: string;
  expiresAt: string;
  createdBy: string;
}

export interface TickerMessagePatch {
  text?: string;
  /** null clears the link. */
  href?: string | null;
  pinned?: boolean;
  startsAt?: string;
  expiresAt?: string;
}

/** True when the message has started and not yet expired at `nowIso`. */
export const isTickerMessageActive = (message: TickerMessage, nowIso: string): boolean =>
  message.startsAt <= nowIso && message.expiresAt > nowIso;

/** Ticker order: pinned first, then the most recently started. */
export const compareTickerMessages = (a: TickerMessage, b: TickerMessage): number =>
  Number(b.pinned === true) - Number(a.pinned === true) || b.startsAt.localeCompare(a.startsAt);

export interface TickerMessagesMethods
  extends CrudRepository<TickerMessage, TickerMessageCreateInput, TickerMessagePatch> {
  /**
   * Messages to show in the ticker right now: started, not expired,
   * pinned first. `now` defaults to the current time.
   */
  listActive(now?: Date): Promise<TickerMessage[]>;
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
  episodeId?: string;
}

export interface VideoPatch {
  title?: string;
  description?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  category?: 'match' | 'highlight' | 'promo' | 'other';
  tags?: string[];
  isPublished?: boolean;
  /** null removes the link. */
  episodeId?: string | null;
}

export interface VideosMethods extends CrudRepository<Video, VideoCreateInput, VideoPatch> {
  listPublished(category?: string): Promise<Video[]>;
}

// ─── Episode input types ────────────────────────────────────────────

export interface EpisodeCreateInput {
  youtubeVideoId: string;
  title: string;
  description?: string;
  thumbnailUrl: string;
  channelName?: string;
  airDate: string;
  eventId?: string;
  /** Defaults to false: episodes start as drafts. */
  isPublished?: boolean;
  createdBy: string;
}

export interface EpisodePatch {
  title?: string;
  description?: string;
  airDate?: string;
  /** null removes the link. */
  eventId?: string | null;
  isPublished?: boolean;
  youtubeVideoId?: string;
  thumbnailUrl?: string;
  channelName?: string;
}

/** Newest air date first, then newest created. */
export const compareEpisodes = (a: Episode, b: Episode): number =>
  b.airDate.localeCompare(a.airDate) || (b.createdAt || '').localeCompare(a.createdAt || '');

export interface EpisodesMethods extends CrudRepository<Episode, EpisodeCreateInput, EpisodePatch> {
  /** Published episodes, newest air date first. */
  listPublished(): Promise<Episode[]>;
  /** Every episode (drafts too) linked to the event. */
  listByEvent(eventId: string): Promise<Episode[]>;
  /** The episode for a YouTube video, for the duplicate check. */
  findByYoutubeId(youtubeVideoId: string): Promise<Episode | null>;
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
  /** Optional pointer to the rivalry this promo advances (RIV-06). */
  rivalryId?: string;
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
  /**
   * All promos tagged to a given rivalry. Powers the rivalry-heat
   * recompute path so promos contribute to a rivalry's score.
   */
  listByRivalry(rivalryId: string): Promise<Promo[]>;
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
  videos: VideosMethods;
  /** Full episodes (YouTube videos). Highlights stay in videos, linked by episodeId. */
  episodes: EpisodesMethods;
  /** GM ticker messages, stored in the Announcements table (kind 'ticker'). */
  tickerMessages: TickerMessagesMethods;
  promos: PromosMethods;
  storylineRequests: StorylineRequestsMethods;
}
