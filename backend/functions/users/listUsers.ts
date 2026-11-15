import { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { listAllUsers, listGroupsByUsername } from '../../lib/cognitoDirectory';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const [allCognitoUsers, groupsByUsername] = await Promise.all([
      listAllUsers(cognitoClient, USER_POOL_ID),
      listGroupsByUsername(cognitoClient, USER_POOL_ID),
    ]);

    const users = allCognitoUsers.map((user) => {
      const attrs: Record<string, string> = {};
      (user.Attributes || []).forEach((attr) => {
        if (attr.Name && attr.Value) {
          attrs[attr.Name] = attr.Value;
        }
      });

      return {
        username: user.Username,
        sub: attrs['sub'] || '',
        email: attrs['email'] || '',
        name: attrs['name'] || '',
        wrestlerName: attrs['custom:wrestler_name'] || '',
        psnId: attrs['custom:psn_id'] || '',
        playerName: attrs['custom:player_name'] || '',
        status: user.UserStatus,
        enabled: user.Enabled,
        created: user.UserCreateDate?.toISOString(),
        groups: (user.Username && groupsByUsername.get(user.Username)) || [],
      };
    });

    return success({ users });
  } catch (error) {
    console.error('List users error:', error);
    return serverError('Failed to list users');
  }
};
