import { APIGatewayProxyHandler } from 'aws-lambda';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { setUserEnabled } from './userActions';

interface ToggleUserEnabledBody {
  username: string;
  enabled: boolean;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<ToggleUserEnabledBody>(event);
    if (parseError) return parseError;
    const { username, enabled } = body;

    if (!username || typeof enabled !== 'boolean') {
      return badRequest('username and enabled (boolean) are required');
    }

    const outcome = await setUserEnabled(username, enabled);
    if (!outcome.ok) return outcome.response;

    return success({
      message: `User ${username} has been ${enabled ? 'enabled' : 'disabled'}`,
      username,
      enabled,
    });
  } catch (error) {
    console.error('Toggle user enabled error:', error);
    return serverError('Failed to update user status');
  }
};
