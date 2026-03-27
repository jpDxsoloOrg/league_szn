import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { v4 as uuidv4 } from 'uuid';

interface CreateAnnouncementBody {
  title: string;
  body: string;
  priority?: number;
  isActive?: boolean;
  expiresAt?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { data: reqBody, error: parseError } = parseBody<CreateAnnouncementBody>(event);
    if (parseError) return parseError;

    const { title, body, priority, isActive, expiresAt } = reqBody;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return badRequest('title is required');
    }
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return badRequest('body is required');
    }

    const auth = getAuthContext(event);
    const now = new Date().toISOString();

    const announcement: Record<string, unknown> = {
      announcementId: uuidv4(),
      title: title.trim(),
      body: body.trim(),
      priority: typeof priority === 'number' ? priority : 1,
      isActive: isActive === false ? 'false' : 'true',
      createdBy: auth.username || auth.sub,
      createdAt: now,
      updatedAt: now,
    };

    if (expiresAt) {
      announcement.expiresAt = expiresAt;
    }

    await dynamoDb.put({
      TableName: TableNames.ANNOUNCEMENTS,
      Item: announcement,
    });

    return created(announcement);
  } catch (err) {
    console.error('Error creating announcement:', err);
    return serverError('Failed to create announcement');
  }
};
