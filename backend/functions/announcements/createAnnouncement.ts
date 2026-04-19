import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface CreateAnnouncementBody {
  title: string;
  body: string;
  priority?: number;
  isActive?: boolean;
  expiresAt?: string;
  videoUrl?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { data: reqBody, error: parseError } = parseBody<CreateAnnouncementBody>(event);
    if (parseError) return parseError;

    const { title, body, priority, isActive, expiresAt, videoUrl } = reqBody;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return badRequest('title is required');
    }
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return badRequest('body is required');
    }

    const auth = getAuthContext(event);
    const { content: { announcements } } = getRepositories();

    const announcement = await announcements.create({
      title,
      body,
      priority,
      isActive,
      expiresAt,
      videoUrl,
      createdBy: auth.username || auth.sub,
    });

    return created(announcement);
  } catch (err) {
    console.error('Error creating announcement:', err);
    return serverError('Failed to create announcement');
  }
};
