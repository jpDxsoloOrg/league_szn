import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, buildUpdateExpression } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface UpdateAnnouncementBody {
  title?: string;
  body?: string;
  priority?: number;
  isActive?: boolean;
  expiresAt?: string | null;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const announcementId = event.pathParameters?.announcementId;
    if (!announcementId) {
      return badRequest('announcementId is required');
    }

    const { data: reqBody, error: parseError } = parseBody<UpdateAnnouncementBody>(event);
    if (parseError) return parseError;

    const result = await dynamoDb.get({
      TableName: TableNames.ANNOUNCEMENTS,
      Key: { announcementId },
    });
    if (!result.Item) {
      return notFound('Announcement not found');
    }

    const { title, body, priority, isActive, expiresAt } = reqBody;

    // Build fields to update, converting isActive boolean to string for GSI
    const fields: Record<string, unknown> = {};
    const removeFields: string[] = [];

    if (title !== undefined) fields.title = title;
    if (body !== undefined) fields.body = body;
    if (priority !== undefined) fields.priority = priority;
    if (isActive !== undefined) fields.isActive = isActive ? 'true' : 'false';
    if (expiresAt !== undefined) {
      if (expiresAt === null) {
        removeFields.push('expiresAt');
      } else {
        fields.expiresAt = expiresAt;
      }
    }

    const updateExpr = buildUpdateExpression(fields, { removeFields });

    if (!updateExpr.hasChanges && removeFields.length === 0) {
      return success(result.Item);
    }

    await dynamoDb.update({
      TableName: TableNames.ANNOUNCEMENTS,
      Key: { announcementId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
    });

    const now = new Date().toISOString();
    const updated = {
      ...result.Item,
      ...fields,
      updatedAt: now,
    };

    return success(updated);
  } catch (err) {
    console.error('Error updating announcement:', err);
    return serverError('Failed to update announcement');
  }
};
