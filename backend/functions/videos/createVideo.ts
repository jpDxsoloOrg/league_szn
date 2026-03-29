import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { v4 as uuidv4 } from 'uuid';

interface CreateVideoBody {
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  category: 'match' | 'highlight' | 'promo' | 'other';
  tags?: string[];
  isPublished?: boolean;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<CreateVideoBody>(event);
    if (parseError) return parseError;

    const { title, description, videoUrl, thumbnailUrl, category, tags, isPublished } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return badRequest('title is required');
    }
    if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim().length === 0) {
      return badRequest('videoUrl is required');
    }
    if (!category || !['match', 'highlight', 'promo', 'other'].includes(category)) {
      return badRequest('category must be "match", "highlight", "promo", or "other"');
    }

    const auth = getAuthContext(event);
    const now = new Date().toISOString();

    const video: Record<string, unknown> = {
      videoId: uuidv4(),
      title: title.trim(),
      description: description?.trim() || '',
      videoUrl: videoUrl.trim(),
      thumbnailUrl: thumbnailUrl?.trim() || '',
      category,
      tags: tags || [],
      isPublished: isPublished === false ? 'false' : 'true',
      uploadedBy: auth.username || auth.sub,
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDb.put({
      TableName: TableNames.VIDEOS,
      Item: video,
    });

    return created(video);
  } catch (err) {
    console.error('Error creating video:', err);
    return serverError('Failed to create video');
  }
};
