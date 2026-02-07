import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

const VALID_ROLES = ['Admin', 'Wrestler', 'Fantasy'] as const;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const { username, role, action } = JSON.parse(event.body) as {
      username: string;
      role: string;
      action: 'promote' | 'demote';
    };

    if (!username || !role || !action) {
      return badRequest('username, role, and action are required');
    }

    if (!VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
      return badRequest(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    }

    if (action !== 'promote' && action !== 'demote') {
      return badRequest('action must be "promote" or "demote"');
    }

    if (action === 'promote') {
      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          GroupName: role,
        })
      );

      // If promoting to Wrestler, also ensure they're in Fantasy
      if (role === 'Wrestler') {
        try {
          await cognitoClient.send(
            new AdminAddUserToGroupCommand({
              UserPoolId: USER_POOL_ID,
              Username: username,
              GroupName: 'Fantasy',
            })
          );
        } catch {
          // May already be in Fantasy group
        }
      }
    } else {
      await cognitoClient.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          GroupName: role,
        })
      );
    }

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
