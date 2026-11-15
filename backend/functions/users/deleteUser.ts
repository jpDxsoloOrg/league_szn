import { APIGatewayProxyHandler } from 'aws-lambda';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { deleteUserAccount } from './userActions';

interface DeleteUserBody {
  username: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<DeleteUserBody>(event);
    if (parseError) return parseError;
    const { username } = body;

    if (!username) {
      return badRequest('username is required');
    }

    const outcome = await deleteUserAccount(username);
    if (!outcome.ok) return outcome.response;

    return success({
      message: `User ${username} has been permanently deleted`,
      username,
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return serverError('Failed to delete user');
  }
};
