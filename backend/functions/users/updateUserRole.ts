import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminListGroupsForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { requireRole, getAuthContext, isSuperAdmin } from '../../lib/auth';
import { MANAGED_ROLES, changeUserRole, type ManagedRole } from './userActions';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<{
      username: string;
      role: string;
      action: 'promote' | 'demote';
    }>(event);
    if (parseError) return parseError;
    const { username, role, action } = body;

    if (!username || !role || !action) {
      return badRequest('username, role, and action are required');
    }

    if (!MANAGED_ROLES.includes(role as ManagedRole)) {
      return badRequest(`Invalid role: ${role}. Must be one of: ${MANAGED_ROLES.join(', ')}`);
    }

    if (action !== 'promote' && action !== 'demote') {
      return badRequest('action must be "promote" or "demote"');
    }

    // Only full Admins can grant/remove Admin or Moderator roles
    if ((role === 'Admin' || role === 'Moderator') && !isSuperAdmin(getAuthContext(event))) {
      return forbidden('Only full Admins can manage Admin and Moderator roles');
    }

    await changeUserRole(username, role as ManagedRole, action);

    // Return updated groups
    const groupsResult = await cognitoClient.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      })
    );
    const groups = (groupsResult.Groups || []).map((g) => g.GroupName!);

    return success({
      message: `User ${username} ${action === 'promote' ? 'added to' : 'removed from'} ${role} group`,
      username,
      groups,
    });
  } catch (error) {
    console.error('Update user role error:', error);
    return serverError('Failed to update user role');
  }
};
