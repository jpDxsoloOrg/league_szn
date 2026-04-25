import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    const isStaff = hasRole(auth, 'Admin', 'Moderator');
    const isOffline = process.env.IS_OFFLINE === 'true';

    const { roster: { players }, content: { videos } } = getRepositories();
    const items = await videos.list();

    // Wrestlers (and any non-staff caller) only see videos they uploaded so
    // unpublished submissions from other users stay private.
    if (!isStaff && !isOffline) {
      const player = auth.sub ? await players.findByUserId(auth.sub) : null;
      const playerId = player?.playerId;
      const filtered = playerId ? items.filter((v) => v.uploadedBy === playerId) : [];
      return success(filtered);
    }

    return success(items);
  } catch (err) {
    console.error('Error listing videos:', err);
    return serverError('Failed to list videos');
  }
};
