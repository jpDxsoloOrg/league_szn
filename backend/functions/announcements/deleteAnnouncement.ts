import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const announcementId = event.pathParameters?.announcementId;
    if (!announcementId) {
      return badRequest('announcementId is required');
    }

    const { announcements } = getRepositories();
    const existing = await announcements.findById(announcementId);
    if (!existing) {
      return notFound('Announcement not found');
    }

    await announcements.delete(announcementId);
    return noContent();
  } catch (err) {
    console.error('Error deleting announcement:', err);
    return serverError('Failed to delete announcement');
  }
};
