import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, buildUpdateExpression } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface UpdateVideoBody {
  title?: string;
  description?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  category?: 'match' | 'highlight' | 'promo' | 'other';
  tags?: string[];
  isPublished?: boolean;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const videoId = event.pathParameters?.videoId;
    if (!videoId) {
      return badRequest('videoId is required');
    }

    const existing = await getOrNotFound(
      TableNames.VIDEOS,
      { videoId },
      'Video not found'
    );
    if ('notFoundResponse' in existing) {
      return existing.notFoundResponse;
    }

    const { data: body, error: parseError } = parseBody<UpdateVideoBody>(event);
    if (parseError) return parseError;

    const fields: Record<string, unknown> = {};

    if (body.title !== undefined) fields.title = body.title.trim();
    if (body.description !== undefined) fields.description = body.description.trim();
    if (body.videoUrl !== undefined) fields.videoUrl = body.videoUrl.trim();
    if (body.thumbnailUrl !== undefined) fields.thumbnailUrl = body.thumbnailUrl.trim();
    if (body.category !== undefined) {
      if (!['match', 'highlight', 'promo', 'other'].includes(body.category)) {
        return badRequest('category must be "match", "highlight", "promo", or "other"');
      }
      fields.category = body.category;
    }
    if (body.tags !== undefined) fields.tags = body.tags;
    if (body.isPublished !== undefined) fields.isPublished = body.isPublished ? 'true' : 'false';

    fields.updatedAt = new Date().toISOString();

    const updateExpr = buildUpdateExpression(fields);

    const result = await dynamoDb.update({
      TableName: TableNames.VIDEOS,
      Key: { videoId },
      ...updateExpr,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating video:', err);
    return serverError('Failed to update video');
  }
};
