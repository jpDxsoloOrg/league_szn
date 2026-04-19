import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, NotFoundError } from '../../lib/repositories';
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

    const { content: { announcements } } = getRepositories();
    const updated = await announcements.update(announcementId, reqBody);
    return success(updated);
  } catch (err) {
    if (err instanceof NotFoundError) return notFound('Announcement not found');
    console.error('Error updating announcement:', err);
    return serverError('Failed to update announcement');
  }
};
