import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  AnnouncementCreateInput,
  AnnouncementPatch,
  AnnouncementsRepository,
} from '../AnnouncementsRepository';
import type { Announcement } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoAnnouncementsRepository implements AnnouncementsRepository {
  async findById(announcementId: string): Promise<Announcement | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.ANNOUNCEMENTS,
      Key: { announcementId },
    });
    return (result.Item as Announcement | undefined) ?? null;
  }

  async list(): Promise<Announcement[]> {
    const items = await dynamoDb.scanAll({ TableName: TableNames.ANNOUNCEMENTS });
    const announcements = items as unknown as Announcement[];
    announcements.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return announcements;
  }

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

    if (input.expiresAt) {
      item.expiresAt = input.expiresAt;
    }
    if (input.videoUrl && input.videoUrl.trim().length > 0) {
      item.videoUrl = input.videoUrl.trim();
    }

    await dynamoDb.put({ TableName: TableNames.ANNOUNCEMENTS, Item: item });
    return item;
  }

  async update(announcementId: string, patch: AnnouncementPatch): Promise<Announcement> {
    const existing = await this.findById(announcementId);
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
  }

  async delete(announcementId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.ANNOUNCEMENTS,
      Key: { announcementId },
    });
  }
}
