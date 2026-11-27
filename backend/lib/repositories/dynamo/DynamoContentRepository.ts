import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import { buildUpdateExpression } from './util';
import {
  compareActiveAnnouncements,
  compareEpisodes,
  compareTickerMessages,
  isTickerMessageActive,
  TICKER_KIND,
} from '../ContentRepository';
import type {
  ContentRepository,
  AnnouncementCreateInput,
  AnnouncementPatch,
  TickerMessageCreateInput,
  TickerMessagePatch,
  TickerMessagesMethods,
  VideoCreateInput,
  VideoPatch,
  VideosMethods,
  EpisodeCreateInput,
  EpisodePatch,
  EpisodesMethods,
  PromoCreateInput,
  PromosMethods,
  StorylineRequestCreateInput,
  StorylineRequestReviewInput,
  StorylineRequestsMethods,
} from '../ContentRepository';
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
    const item = result.Item as (Announcement & { kind?: string }) | undefined;
    // Ticker messages share the table; they are not announcements.
    if (!item || item.kind === TICKER_KIND) return null;
    return item;
  }

  return {
    findById,

    async list(): Promise<Announcement[]> {
      const items = await dynamoDb.scanAll({ TableName: TableNames.ANNOUNCEMENTS });
      const announcements = (items as unknown as Array<Announcement & { kind?: string }>)
        .filter((item) => item.kind !== TICKER_KIND);
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
        .filter((item) => (item as Announcement & { kind?: string }).kind !== TICKER_KIND)
        .filter((item) => !item.expiresAt || item.expiresAt > now)
        .sort(compareActiveAnnouncements);

      return announcements;
    },

    async create(input: AnnouncementCreateInput): Promise<Announcement> {
      const now = new Date().toISOString();
      const item: Announcement = {
        announcementId: uuidv4(),
        title: input.title.trim(),
        body: input.body.trim(),
        priority: typeof input.priority === 'number' ? input.priority : 1,
        isActive: input.isActive === false || (input.isActive as unknown) === 'false' ? 'false' : 'true',
        showAsPopup: input.showAsPopup === true,
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
      if (patch.isActive !== undefined) {
        fields.isActive = patch.isActive === false || (patch.isActive as unknown) === 'false' ? 'false' : 'true';
      }
      if (patch.expiresAt !== undefined && patch.expiresAt !== null) {
        fields.expiresAt = patch.expiresAt;
      }
      if (patch.showAsPopup !== undefined) fields.showAsPopup = patch.showAsPopup === true;

      const now = new Date().toISOString();

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

function buildVideosMethods(): VideosMethods {
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
      if (input.episodeId) item.episodeId = input.episodeId;
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
      if (patch.isPublished !== undefined) fields.isPublished = patch.isPublished === true ? 'true' : 'false';
      if (typeof patch.episodeId === 'string') fields.episodeId = patch.episodeId;

      const expr = buildUpdateExpression(fields, new Date().toISOString());
      // buildUpdateExpression only SETs; a null link is removed, never stored as NULL.
      const updateExpression = patch.episodeId === null
        ? `${expr.UpdateExpression} REMOVE episodeId`
        : expr.UpdateExpression;
      const result = await dynamoDb.update({
        TableName: TableNames.VIDEOS,
        Key: { videoId },
        UpdateExpression: updateExpression,
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

// ─── Episodes ──────────────────────────────────────────────────────

function buildEpisodesMethods(): EpisodesMethods {
  return {
    async findById(episodeId: string): Promise<Episode | null> {
      const result = await dynamoDb.get({
        TableName: TableNames.EPISODES,
        Key: { episodeId },
      });
      return (result.Item as Episode | undefined) ?? null;
    },

    async list(): Promise<Episode[]> {
      const items = await dynamoDb.scanAll({ TableName: TableNames.EPISODES });
      const episodes = items as unknown as Episode[];
      return episodes.sort(compareEpisodes);
    },

    async listPublished(): Promise<Episode[]> {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.EPISODES,
        IndexName: 'PublishedIndex',
        KeyConditionExpression: 'isPublished = :pub',
        ExpressionAttributeValues: { ':pub': 'true' },
        ScanIndexForward: false,
      });
      // The index orders by airDate only; settle same-day ties by createdAt.
      return (items as unknown as Episode[]).sort(compareEpisodes);
    },

    async listByEvent(eventId: string): Promise<Episode[]> {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.EPISODES,
        IndexName: 'EventIndex',
        KeyConditionExpression: 'eventId = :eventId',
        ExpressionAttributeValues: { ':eventId': eventId },
      });
      return (items as unknown as Episode[]).sort(compareEpisodes);
    },

    async findByYoutubeId(youtubeVideoId: string): Promise<Episode | null> {
      // A small table: a filtered scan is enough for the duplicate check.
      const items = await dynamoDb.scanAll({
        TableName: TableNames.EPISODES,
        FilterExpression: 'youtubeVideoId = :yt',
        ExpressionAttributeValues: { ':yt': youtubeVideoId },
      });
      return (items[0] as unknown as Episode | undefined) ?? null;
    },

    async create(input: EpisodeCreateInput): Promise<Episode> {
      const now = new Date().toISOString();
      const item: Episode = {
        episodeId: uuidv4(),
        source: 'youtube',
        youtubeVideoId: input.youtubeVideoId,
        title: input.title.trim(),
        description: input.description?.trim() || '',
        thumbnailUrl: input.thumbnailUrl,
        airDate: input.airDate,
        isPublished: input.isPublished === true ? 'true' : 'false',
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      };
      if (input.channelName?.trim()) item.channelName = input.channelName.trim();
      if (input.eventId) item.eventId = input.eventId;
      await dynamoDb.put({ TableName: TableNames.EPISODES, Item: item });
      return item;
    },

    async update(episodeId: string, patch: EpisodePatch): Promise<Episode> {
      const fields: Record<string, unknown> = {};
      if (patch.title !== undefined) fields.title = patch.title.trim();
      if (patch.description !== undefined) fields.description = patch.description.trim();
      if (patch.airDate !== undefined) fields.airDate = patch.airDate;
      if (typeof patch.eventId === 'string') fields.eventId = patch.eventId;
      if (patch.isPublished !== undefined) fields.isPublished = patch.isPublished === true ? 'true' : 'false';
      if (patch.youtubeVideoId !== undefined) fields.youtubeVideoId = patch.youtubeVideoId;
      if (patch.thumbnailUrl !== undefined) fields.thumbnailUrl = patch.thumbnailUrl;
      if (patch.channelName !== undefined) fields.channelName = patch.channelName.trim();

      const expr = buildUpdateExpression(fields, new Date().toISOString());
      // eventId is the EventIndex key: DynamoDB rejects NULL there, so unlinking REMOVEs it.
      const updateExpression = patch.eventId === null
        ? `${expr.UpdateExpression} REMOVE eventId`
        : expr.UpdateExpression;
      const result = await dynamoDb.update({
        TableName: TableNames.EPISODES,
        Key: { episodeId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(episodeId)',
        ReturnValues: 'ALL_NEW',
      }).catch((err: { name?: string }) => {
        if (err.name === 'ConditionalCheckFailedException') {
          throw new NotFoundError('Episode', episodeId);
        }
        throw err;
      });
      return result.Attributes as Episode;
    },

    async delete(episodeId: string): Promise<void> {
      await dynamoDb.delete({
        TableName: TableNames.EPISODES,
        Key: { episodeId },
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

    async listByRivalry(rivalryId: string): Promise<Promo[]> {
      // No GSI on rivalryId (yet); promo volume per rivalry is small,
      // so a filtered scan is fine. Mirrors `listResponsesTo`.
      const items = await dynamoDb.scanAll({
        TableName: TableNames.PROMOS,
        FilterExpression: 'rivalryId = :rid',
        ExpressionAttributeValues: { ':rid': rivalryId },
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
        rivalryId: input.rivalryId,
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

// ─── Ticker messages (Announcements table, kind 'ticker') ──────────

type TickerMessageRow = TickerMessage & { announcementId: string; kind: typeof TICKER_KIND };

function toTickerMessage(row: Record<string, unknown>): TickerMessage {
  const { announcementId, kind, ...message } = row as unknown as TickerMessageRow;
  void announcementId;
  void kind;
  return message;
}

function buildTickerMessagesMethods(): TickerMessagesMethods {
  async function findById(messageId: string): Promise<TickerMessage | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.ANNOUNCEMENTS,
      Key: { announcementId: messageId },
    });
    const item = result.Item as Record<string, unknown> | undefined;
    if (!item || item.kind !== TICKER_KIND) return null;
    return toTickerMessage(item);
  }

  async function list(): Promise<TickerMessage[]> {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.ANNOUNCEMENTS,
      FilterExpression: '#kind = :ticker',
      ExpressionAttributeNames: { '#kind': 'kind' },
      ExpressionAttributeValues: { ':ticker': TICKER_KIND },
    });
    return items
      .filter((item) => item.kind === TICKER_KIND)
      .map(toTickerMessage)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return {
    findById,
    list,

    async listActive(now: Date = new Date()): Promise<TickerMessage[]> {
      const nowIso = now.toISOString();
      return (await list())
        .filter((message) => isTickerMessageActive(message, nowIso))
        .sort(compareTickerMessages);
    },

    async create(input: TickerMessageCreateInput): Promise<TickerMessage> {
      const now = new Date().toISOString();
      const message: TickerMessage = {
        messageId: uuidv4(),
        text: input.text.trim(),
        pinned: input.pinned === true,
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      };
      const href = input.href?.trim();
      if (href) message.href = href;

      const row: TickerMessageRow = { ...message, announcementId: message.messageId, kind: TICKER_KIND };
      await dynamoDb.put({ TableName: TableNames.ANNOUNCEMENTS, Item: row });
      return message;
    },

    async update(messageId: string, patch: TickerMessagePatch): Promise<TickerMessage> {
      const existing = await findById(messageId);
      if (!existing) throw new NotFoundError('TickerMessage', messageId);

      const fields: Record<string, unknown> = {};
      if (patch.text !== undefined) fields.text = patch.text.trim();
      if (patch.pinned !== undefined) fields.pinned = patch.pinned === true;
      if (patch.startsAt !== undefined) fields.startsAt = patch.startsAt;
      if (patch.expiresAt !== undefined) fields.expiresAt = patch.expiresAt;
      const href = typeof patch.href === 'string' ? patch.href.trim() : patch.href;
      if (href) fields.href = href;
      const clearHref = href === null || href === '';

      const now = new Date().toISOString();
      const expr = buildUpdateExpression(fields, now);
      await dynamoDb.update({
        TableName: TableNames.ANNOUNCEMENTS,
        Key: { announcementId: messageId },
        UpdateExpression: clearHref ? `${expr.UpdateExpression} REMOVE href` : expr.UpdateExpression,
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
      });

      const updated: TickerMessage = { ...existing, ...fields, updatedAt: now } as TickerMessage;
      if (clearHref) delete updated.href;
      return updated;
    },

    async delete(messageId: string): Promise<void> {
      await dynamoDb.delete({
        TableName: TableNames.ANNOUNCEMENTS,
        Key: { announcementId: messageId },
      });
    },
  };
}

// ─── Aggregate class ───────────────────────────────────────────────

export class DynamoContentRepository implements ContentRepository {
  announcements = buildAnnouncementsMethods();
  videos = buildVideosMethods();
  episodes = buildEpisodesMethods();
  tickerMessages = buildTickerMessagesMethods();
  promos = buildPromosMethods();
  storylineRequests = buildStorylineRequestsMethods();
}
