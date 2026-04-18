import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  VideoCreateInput,
  VideoPatch,
  VideosRepository,
} from '../VideosRepository';
import type { Video } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoVideosRepository implements VideosRepository {
  async findById(videoId: string): Promise<Video | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.VIDEOS,
      Key: { videoId },
    });
    return (result.Item as Video | undefined) ?? null;
  }

  async list(): Promise<Video[]> {
    const items = await dynamoDb.scanAll({ TableName: TableNames.VIDEOS });
    const videos = items as unknown as Video[];
    videos.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return videos;
  }

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
    await dynamoDb.put({ TableName: TableNames.VIDEOS, Item: item });
    return item;
  }

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
  }

  async delete(videoId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.VIDEOS,
      Key: { videoId },
    });
  }
}
