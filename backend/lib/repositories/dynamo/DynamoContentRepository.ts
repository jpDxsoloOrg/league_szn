import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import { buildUpdateExpression } from './util';
import type {
  ContentRepository,
  AnnouncementCreateInput,
  AnnouncementPatch,
  VideoCreateInput,
  VideoPatch,
  PromoCreateInput,
  PromosMethods,
  StorylineRequestCreateInput,
  StorylineRequestReviewInput,
  StorylineRequestsMethods,
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

type AnnouncementsCrud = CrudRepository<Announcement, AnnouncementCreateInput, AnnouncementPatch> & {
  listActive(): Promise<Announcement[]>;
};

function buildAnnouncementsMethods(): AnnouncementsCrud {
  async function findById(announcementId: string): Promise<Announcement | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.ANNOUNCEMENTS,
      Key: { announcementId },
    });
    return (result.Item as Announcement | undefined) ?? null;
  }

  return {
    findById,

    async list(): Promise<Announcement[]> {
      const items = await dynamoDb.scanAll({ TableName: TableNames.ANNOUNCEMENTS });
      const announcements = items as unknown as Announcement[];
      announcements.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      return announcements;
    },

    async listActive(): Promise<Announcement[]> {
      const result = await dynamoDb.query({
        TableName: TableNames.ANNOUNCEMENTS,
        IndexName: 'ActiveIndex',
        KeyConditionExpression: 'isActive = :active',
        ExpressionAttributeValues: { ':active': 'true' },
      });

      const now = new Date().toISOString();
      const announcements = ((result.Items || []) as unknown as Announcement[])
        .filter((item) => !item.expiresAt || item.expiresAt > now)
        .sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));

      return announcements;
    },

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

      if (input.expiresAt) {
        item.expiresAt = input.expiresAt;
      }
      if (input.videoUrl && input.videoUrl.trim().length > 0) {
        item.videoUrl = input.videoUrl.trim();
      }

      await dynamoDb.put({ TableName: TableNames.ANNOUNCEMENTS, Item: item });
      return item;
    },

    async update(announcementId: string, patch: AnnouncementPatch): Promise<Announcement> {
      const existing = await findById(announcementId);
      if (!existing) throw new NotFoundError('Announcement', announcementId);

      const fields: Record<string, unknown> = {};
      if (patch.title !== undefined) fields.title = patch.title;
      if (patch.body !== undefined) fields.body = patch.body;
      if (patch.priority !== undefined) fields.priority = patch.priority;
      if (patch.isActive !== undefined) fields.isActive = patch.isActive ? 'true' : 'false';
      if (patch.expiresAt !== undefined && patch.expiresAt !== null) {
        fields.expiresAt = patch.expiresAt;
      }

      const now = new Date().toISOString();
      fields.updatedAt = now;

      const expr = buildUpdateExpression(fields, now);

      // Handle REMOVE for null expiresAt
      let updateExpression = expr.UpdateExpression;
      if (patch.expiresAt === null) {
        updateExpression += ' REMOVE expiresAt';
      }

      await dynamoDb.update({
        TableName: TableNames.ANNOUNCEMENTS,
        Key: { announcementId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
      });

      const updated: Announcement = { ...existing, ...fields, updatedAt: now } as Announcement;
      if (patch.expiresAt === null) {
        delete updated.expiresAt;
      }
      return updated;
    },

    async delete(announcementId: string): Promise<void> {
      await dynamoDb.delete({
        TableName: TableNames.ANNOUNCEMENTS,
        Key: { announcementId },
      });
    },
  };
}

// ─── Videos ────────────────────────────────────────────────────────

type VideosCrud = CrudRepository<Video, VideoCreateInput, VideoPatch> & {
  listPublished(category?: string): Promise<Video[]>;
};

function buildVideosMethods(): VideosCrud {
  return {
    async findById(videoId: string): Promise<Video | null> {
      const result = await dynamoDb.get({
        TableName: TableNames.VIDEOS,
        Key: { videoId },
      });
      return (result.Item as Video | undefined) ?? null;
    },

    async list(): Promise<Video[]> {
      const items = await dynamoDb.scanAll({ TableName: TableNames.VIDEOS });
      const videos = items as unknown as Video[];
      videos.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return videos;
    },

    async listPublished(category?: string): Promise<Video[]> {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.VIDEOS,
        IndexName: 'PublishedIndex',
        KeyConditionExpression: 'isPublished = :pub',
        ExpressionAttributeValues: { ':pub': 'true' },
        ScanIndexForward: false,
      });
      const videos = items as unknown as Video[];
      return category ? videos.filter((v) => v.category === category) : videos;
    },

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
      await dynamoDb.put({ TableName: TableNames.VIDEOS, Item: item });
      return item;
    },

    async update(videoId: string, patch: VideoPatch): Promise<Video> {
      const fields: Record<string, unknown> = {};
      if (patch.title !== undefined) fields.title = patch.title.trim();
      if (patch.description !== undefined) fields.description = patch.description.trim();
      if (patch.videoUrl !== undefined) fields.videoUrl = patch.videoUrl.trim();
      if (patch.thumbnailUrl !== undefined) fields.thumbnailUrl = patch.thumbnailUrl.trim();
      if (patch.category !== undefined) fields.category = patch.category;
      if (patch.tags !== undefined) fields.tags = patch.tags;
      if (patch.isPublished !== undefined) fields.isPublished = patch.isPublished ? 'true' : 'false';

      const expr = buildUpdateExpression(fields, new Date().toISOString());
      const result = await dynamoDb.update({
        TableName: TableNames.VIDEOS,
        Key: { videoId },
        UpdateExpression: expr.UpdateExpression,
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(videoId)',
        ReturnValues: 'ALL_NEW',
      }).catch((err: { name?: string }) => {
        if (err.name === 'ConditionalCheckFailedException') {
          throw new NotFoundError('Video', videoId);
        }
        throw err;
      });
      return result.Attributes as Video;
    },

    async delete(videoId: string): Promise<void> {
      await dynamoDb.delete({
        TableName: TableNames.VIDEOS,
        Key: { videoId },
      });
    },
  };
}

// ─── Promos ────────────────────────────────────────────────────────

function buildPromosMethods(): PromosMethods {
  async function findById(promoId: string): Promise<Promo | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.PROMOS,
      Key: { promoId },
    });
    return (result.Item as Promo | undefined) ?? null;
  }

  return {
    findById,

    async list(): Promise<Promo[]> {
      const items = await dynamoDb.scanAll({
        TableName: TableNames.PROMOS,
      });
      const promos = items as unknown as Promo[];
      promos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return promos;
    },

    async listByPlayer(playerId: string): Promise<Promo[]> {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.PROMOS,
        IndexName: 'PlayerIndex',
        KeyConditionExpression: 'playerId = :pid',
        ExpressionAttributeValues: { ':pid': playerId },
        ScanIndexForward: false,
      });
      return items as unknown as Promo[];
    },

    async listByType(promoType: PromoType): Promise<Promo[]> {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.PROMOS,
        IndexName: 'TypeIndex',
        KeyConditionExpression: 'promoType = :pt',
        ExpressionAttributeValues: { ':pt': promoType },
        ScanIndexForward: false,
      });
      return items as unknown as Promo[];
    },

    async listResponsesTo(targetPromoId: string): Promise<Promo[]> {
      // No GSI on targetPromoId, so scan with a filter.
      const items = await dynamoDb.scanAll({
        TableName: TableNames.PROMOS,
        FilterExpression: 'targetPromoId = :tpid',
        ExpressionAttributeValues: { ':tpid': targetPromoId },
      });
      const promos = items as unknown as Promo[];
      promos.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return promos;
    },

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
      await dynamoDb.put({ TableName: TableNames.PROMOS, Item: item });
      return item;
    },

    async update(promoId: string, patch: Partial<Promo>): Promise<Promo> {
      const expr = buildUpdateExpression(patch, new Date().toISOString());
      const result = await dynamoDb
        .update({
          TableName: TableNames.PROMOS,
          Key: { promoId },
          UpdateExpression: expr.UpdateExpression,
          ExpressionAttributeNames: expr.ExpressionAttributeNames,
          ExpressionAttributeValues: expr.ExpressionAttributeValues,
          ConditionExpression: 'attribute_exists(promoId)',
          ReturnValues: 'ALL_NEW',
        })
        .catch((err: { name?: string }) => {
          if (err.name === 'ConditionalCheckFailedException') {
            throw new NotFoundError('Promo', promoId);
          }
          throw err;
        });
      return result.Attributes as Promo;
    },

    async delete(promoId: string): Promise<void> {
      await dynamoDb.delete({
        TableName: TableNames.PROMOS,
        Key: { promoId },
      });
    },

    async addReaction(promoId: string, userId: string, reaction: ReactionType): Promise<Promo> {
      const existing = await findById(promoId);
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

      const now = new Date().toISOString();
      await dynamoDb.update({
        TableName: TableNames.PROMOS,
        Key: { promoId },
        UpdateExpression: 'SET reactions = :r, reactionCounts = :rc, updatedAt = :now',
        ExpressionAttributeValues: {
          ':r': reactions,
          ':rc': reactionCounts,
          ':now': now,
        },
      });

      return { ...existing, reactions, reactionCounts, updatedAt: now };
    },

    async removeReaction(promoId: string, userId: string): Promise<Promo> {
      const existing = await findById(promoId);
      if (!existing) throw new NotFoundError('Promo', promoId);

      const reactions = { ...existing.reactions };
      const reactionCounts = { ...existing.reactionCounts };

      const previousReaction = reactions[userId];
      if (previousReaction) {
        reactionCounts[previousReaction] = Math.max(0, (reactionCounts[previousReaction] || 0) - 1);
        delete reactions[userId];
      }

      const now = new Date().toISOString();
      await dynamoDb.update({
        TableName: TableNames.PROMOS,
        Key: { promoId },
        UpdateExpression: 'SET reactions = :r, reactionCounts = :rc, updatedAt = :now',
        ExpressionAttributeValues: {
          ':r': reactions,
          ':rc': reactionCounts,
          ':now': now,
        },
      });

      return { ...existing, reactions, reactionCounts, updatedAt: now };
    },
  };
}

// ─── Storyline Requests ────────────────────────────────────────────

function buildStorylineRequestsMethods(): StorylineRequestsMethods {
  async function findById(requestId: string): Promise<StorylineRequest | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.STORYLINE_REQUESTS,
      Key: { requestId },
    });
    return (result.Item as StorylineRequest | undefined) ?? null;
  }

  return {
    findById,

    async list(): Promise<StorylineRequest[]> {
      const result = await dynamoDb.scanAll({
        TableName: TableNames.STORYLINE_REQUESTS,
      });
      const items = result as unknown as StorylineRequest[];
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    },

    async listByStatus(status: StorylineRequestStatus): Promise<StorylineRequest[]> {
      const result = await dynamoDb.queryAll({
        TableName: TableNames.STORYLINE_REQUESTS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,
      });
      const items = result as unknown as StorylineRequest[];
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    },

    async listByRequester(requesterId: string): Promise<StorylineRequest[]> {
      const result = await dynamoDb.queryAll({
        TableName: TableNames.STORYLINE_REQUESTS,
        IndexName: 'RequesterIndex',
        KeyConditionExpression: 'requesterId = :requesterId',
        ExpressionAttributeValues: { ':requesterId': requesterId },
        ScanIndexForward: false,
      });
      const items = result as unknown as StorylineRequest[];
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    },

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
      await dynamoDb.put({
        TableName: TableNames.STORYLINE_REQUESTS,
        Item: item,
      });
      return item;
    },

    async review(requestId: string, input: StorylineRequestReviewInput): Promise<StorylineRequest> {
      const existing = await findById(requestId);
      if (!existing) throw new NotFoundError('StorylineRequest', requestId);

      const now = new Date().toISOString();

      const updateExpr: string[] = [
        '#status = :status',
        'updatedAt = :updatedAt',
        'reviewedBy = :reviewedBy',
      ];
      const attrNames: Record<string, string> = { '#status': 'status' };
      const attrValues: Record<string, unknown> = {
        ':status': input.status,
        ':updatedAt': now,
        ':reviewedBy': input.reviewedBy,
      };

      if (input.gmNote) {
        updateExpr.push('gmNote = :gmNote');
        attrValues[':gmNote'] = input.gmNote;
      }

      const result = await dynamoDb.update({
        TableName: TableNames.STORYLINE_REQUESTS,
        Key: { requestId },
        UpdateExpression: `SET ${updateExpr.join(', ')}`,
        ExpressionAttributeNames: attrNames,
        ExpressionAttributeValues: attrValues,
        ReturnValues: 'ALL_NEW',
      });

      return result.Attributes as StorylineRequest;
    },
  };
}

// ─── Aggregate class ───────────────────────────────────────────────

export class DynamoContentRepository implements ContentRepository {
  announcements = buildAnnouncementsMethods();
  videos = buildVideosMethods();
  promos = buildPromosMethods();
  storylineRequests = buildStorylineRequestsMethods();
}
