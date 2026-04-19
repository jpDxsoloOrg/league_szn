import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  ContentRepository,
  AnnouncementCreateInput,
  AnnouncementPatch,
  PromoCreateInput,
  PromosMethods,
  StorylineRequestCreateInput,
  StorylineRequestReviewInput,
  StorylineRequestsMethods,
  VideoCreateInput,
  VideoPatch,
} from '../ContentRepository';
import type {
  Announcement,
  Video,
  Promo,
  PromoType,
  ReactionType,
  StorylineRequest,
  StorylineRequestStatus,
} from '../types';
import type { CrudRepository } from '../CrudRepository';

// ─── Announcements ─────────────────────────────────────────────────

type AnnouncementsMethods = CrudRepository<Announcement, AnnouncementCreateInput, AnnouncementPatch> & {
  listActive(): Promise<Announcement[]>;
};

class AnnouncementsImpl implements AnnouncementsMethods {
  readonly store = new Map<string, Announcement>();

  async findById(announcementId: string): Promise<Announcement | null> {
    return this.store.get(announcementId) ?? null;
  }

  async list(): Promise<Announcement[]> {
    const items = Array.from(this.store.values());
    items.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return items;
  }

  async listActive(): Promise<Announcement[]> {
    const now = new Date().toISOString();
    return Array.from(this.store.values())
      .filter((a) => a.isActive === 'true' && (!a.expiresAt || a.expiresAt > now))
      .sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));
  }

  async create(input: AnnouncementCreateInput): Promise<Announcement> {
    const now = new Date().toISOString();
    const item: Announcement = {
      announcementId: uuidv4(),
      title: input.title.trim(),
      body: input.body.trim(),
      priority: typeof input.priority === 'number' ? input.priority : 1,
      isActive: input.isActive === false ? 'false' : 'true',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    if (input.expiresAt) item.expiresAt = input.expiresAt;
    if (input.videoUrl && input.videoUrl.trim().length > 0) item.videoUrl = input.videoUrl.trim();

    this.store.set(item.announcementId, item);
    return item;
  }

  async update(announcementId: string, patch: AnnouncementPatch): Promise<Announcement> {
    const existing = this.store.get(announcementId);
    if (!existing) throw new NotFoundError('Announcement', announcementId);

    const now = new Date().toISOString();
    const updated: Announcement = { ...existing, updatedAt: now };

    if (patch.title !== undefined) updated.title = patch.title;
    if (patch.body !== undefined) updated.body = patch.body;
    if (patch.priority !== undefined) updated.priority = patch.priority;
    if (patch.isActive !== undefined) updated.isActive = patch.isActive ? 'true' : 'false';
    if (patch.expiresAt === null) {
      delete updated.expiresAt;
    } else if (patch.expiresAt !== undefined) {
      updated.expiresAt = patch.expiresAt;
    }

    this.store.set(announcementId, updated);
    return updated;
  }

  async delete(announcementId: string): Promise<void> {
    this.store.delete(announcementId);
  }
}

// ─── Videos ────────────────────────────────────────────────────────

type VideosMethods = CrudRepository<Video, VideoCreateInput, VideoPatch> & {
  listPublished(category?: string): Promise<Video[]>;
};

class VideosImpl implements VideosMethods {
  readonly store = new Map<string, Video>();

  async findById(videoId: string): Promise<Video | null> {
    return this.store.get(videoId) ?? null;
  }

  async list(): Promise<Video[]> {
    const videos = Array.from(this.store.values());
    videos.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return videos;
  }

  async listPublished(category?: string): Promise<Video[]> {
    let videos = Array.from(this.store.values()).filter((v) => v.isPublished === 'true');
    if (category) videos = videos.filter((v) => v.category === category);
    videos.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return videos;
  }

  async create(input: VideoCreateInput): Promise<Video> {
    const now = new Date().toISOString();
    const item: Video = {
      videoId: uuidv4(),
      title: input.title.trim(),
      description: input.description?.trim() || '',
      videoUrl: input.videoUrl.trim(),
      thumbnailUrl: input.thumbnailUrl?.trim() || '',
      category: input.category,
      tags: input.tags || [],
      isPublished: input.isPublished === false ? 'false' : 'true',
      uploadedBy: input.uploadedBy,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.videoId, item);
    return item;
  }

  async update(videoId: string, patch: VideoPatch): Promise<Video> {
    const existing = this.store.get(videoId);
    if (!existing) throw new NotFoundError('Video', videoId);

    const fields: Partial<Video> = {};
    if (patch.title !== undefined) fields.title = patch.title.trim();
    if (patch.description !== undefined) fields.description = patch.description.trim();
    if (patch.videoUrl !== undefined) fields.videoUrl = patch.videoUrl.trim();
    if (patch.thumbnailUrl !== undefined) fields.thumbnailUrl = patch.thumbnailUrl.trim();
    if (patch.category !== undefined) fields.category = patch.category;
    if (patch.tags !== undefined) fields.tags = patch.tags;
    if (patch.isPublished !== undefined) fields.isPublished = patch.isPublished ? 'true' : 'false';

    const updated: Video = { ...existing, ...fields, updatedAt: new Date().toISOString() };
    this.store.set(videoId, updated);
    return updated;
  }

  async delete(videoId: string): Promise<void> {
    this.store.delete(videoId);
  }
}

// ─── Promos ────────────────────────────────────────────────────────

class PromosImpl implements PromosMethods {
  readonly store = new Map<string, Promo>();

  async findById(promoId: string): Promise<Promo | null> {
    return this.store.get(promoId) ?? null;
  }

  async list(): Promise<Promo[]> {
    return Array.from(this.store.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async listByPlayer(playerId: string): Promise<Promo[]> {
    return Array.from(this.store.values())
      .filter((p) => p.playerId === playerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listByType(promoType: PromoType): Promise<Promo[]> {
    return Array.from(this.store.values())
      .filter((p) => p.promoType === promoType)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listResponsesTo(targetPromoId: string): Promise<Promo[]> {
    return Array.from(this.store.values())
      .filter((p) => p.targetPromoId === targetPromoId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async create(input: PromoCreateInput): Promise<Promo> {
    const now = new Date().toISOString();
    const item: Promo = {
      promoId: uuidv4(),
      playerId: input.playerId,
      promoType: input.promoType,
      title: input.title,
      content: input.content,
      targetPlayerId: input.targetPlayerId,
      targetPromoId: input.targetPromoId,
      matchId: input.matchId,
      championshipId: input.championshipId,
      imageUrl: input.imageUrl,
      challengeMode: input.challengeMode,
      challengerTagTeamName: input.challengerTagTeamName,
      targetTagTeamName: input.targetTagTeamName,
      reactions: {},
      reactionCounts: { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
      isPinned: false,
      isHidden: false,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.promoId, item);
    return item;
  }

  async update(promoId: string, patch: Partial<Promo>): Promise<Promo> {
    const existing = this.store.get(promoId);
    if (!existing) throw new NotFoundError('Promo', promoId);
    const updated: Promo = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(promoId, updated);
    return updated;
  }

  async delete(promoId: string): Promise<void> {
    this.store.delete(promoId);
  }

  async addReaction(promoId: string, userId: string, reaction: ReactionType): Promise<Promo> {
    const existing = this.store.get(promoId);
    if (!existing) throw new NotFoundError('Promo', promoId);

    const reactions = { ...existing.reactions };
    const reactionCounts = { ...existing.reactionCounts };

    // Remove previous reaction if the user already reacted
    const previousReaction = reactions[userId];
    if (previousReaction) {
      reactionCounts[previousReaction] = Math.max(0, (reactionCounts[previousReaction] || 0) - 1);
    }

    // Set the new reaction
    reactions[userId] = reaction;
    reactionCounts[reaction] = (reactionCounts[reaction] || 0) + 1;

    const updated: Promo = {
      ...existing,
      reactions,
      reactionCounts,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(promoId, updated);
    return updated;
  }

  async removeReaction(promoId: string, userId: string): Promise<Promo> {
    const existing = this.store.get(promoId);
    if (!existing) throw new NotFoundError('Promo', promoId);

    const reactions = { ...existing.reactions };
    const reactionCounts = { ...existing.reactionCounts };

    const previousReaction = reactions[userId];
    if (previousReaction) {
      reactionCounts[previousReaction] = Math.max(0, (reactionCounts[previousReaction] || 0) - 1);
      delete reactions[userId];
    }

    const updated: Promo = {
      ...existing,
      reactions,
      reactionCounts,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(promoId, updated);
    return updated;
  }
}

// ─── Storyline Requests ────────────────────────────────────────────

class StorylineRequestsImpl implements StorylineRequestsMethods {
  readonly store = new Map<string, StorylineRequest>();

  async findById(requestId: string): Promise<StorylineRequest | null> {
    return this.store.get(requestId) ?? null;
  }

  async list(): Promise<StorylineRequest[]> {
    const items = Array.from(this.store.values());
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listByStatus(status: StorylineRequestStatus): Promise<StorylineRequest[]> {
    const items = Array.from(this.store.values()).filter(
      (r) => r.status === status,
    );
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listByRequester(requesterId: string): Promise<StorylineRequest[]> {
    const items = Array.from(this.store.values()).filter(
      (r) => r.requesterId === requesterId,
    );
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async create(input: StorylineRequestCreateInput): Promise<StorylineRequest> {
    const now = new Date().toISOString();
    const item: StorylineRequest = {
      requestId: uuidv4(),
      requesterId: input.requesterId,
      targetPlayerIds: input.targetPlayerIds,
      requestType: input.requestType,
      description: input.description,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.requestId, item);
    return item;
  }

  async review(requestId: string, input: StorylineRequestReviewInput): Promise<StorylineRequest> {
    const existing = this.store.get(requestId);
    if (!existing) throw new NotFoundError('StorylineRequest', requestId);

    const now = new Date().toISOString();
    const updated: StorylineRequest = {
      ...existing,
      status: input.status,
      reviewedBy: input.reviewedBy,
      updatedAt: now,
    };

    if (input.gmNote) {
      updated.gmNote = input.gmNote;
    }

    this.store.set(requestId, updated);
    return updated;
  }
}

// ─── Aggregate ─────────────────────────────────────────────────────

export class InMemoryContentRepository implements ContentRepository {
  readonly announcements: AnnouncementsImpl;
  readonly videos: VideosImpl;
  readonly promos: PromosImpl;
  readonly storylineRequests: StorylineRequestsImpl;

  constructor() {
    this.announcements = new AnnouncementsImpl();
    this.videos = new VideosImpl();
    this.promos = new PromosImpl();
    this.storylineRequests = new StorylineRequestsImpl();
  }
}
