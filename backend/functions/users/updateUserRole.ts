import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { success, badRequest, forbidden, serverError } from '../../lib/response';
import { requireRole, getAuthContext, isSuperAdmin } from '../../lib/auth';
import { getRepositories } from '../../lib/repositories';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

const VALID_ROLES = ['Admin', 'Moderator', 'Wrestler', 'Fantasy'] as const;

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

    // Only full Admins can grant/remove Admin or Moderator roles
    if ((role === 'Admin' || role === 'Moderator') && !isSuperAdmin(getAuthContext(event))) {
      return forbidden('Only full Admins can manage Admin and Moderator roles');
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

        // Auto-create a Player record for this Wrestler if one doesn't exist
        try {
          const userResult = await cognitoClient.send(
            new AdminGetUserCommand({
              UserPoolId: USER_POOL_ID,
              Username: username,
            })
          );

          const attrs = userResult.UserAttributes || [];
          const sub = attrs.find((a) => a.Name === 'sub')?.Value;
          const wrestlerName = attrs.find((a) => a.Name === 'custom:wrestler_name')?.Value || '';

          if (!sub) {
            console.error('User sub attribute missing for username:', username);
            throw new Error('User sub attribute missing');
          }

          // Check if a player already exists for this userId
          const { players } = getRepositories();
          const existingPlayer = await players.findByUserId(sub);

          if (!existingPlayer) {
            const newPlayer = await players.create({
              name: '',
              currentWrestler: wrestlerName || '',
            });
            await players.update(newPlayer.playerId, { userId: sub });
          }
        } catch (playerError) {
          console.error('Failed to auto-create player for wrestler:', playerError);
          // Non-blocking: don't fail the role change
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
