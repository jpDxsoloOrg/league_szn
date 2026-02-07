import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminListGroupsForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const result = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Limit: 60,
      })
    );

    const users = await Promise.all(
      (result.Users || []).map(async (user) => {
        const attrs: Record<string, string> = {};
        (user.Attributes || []).forEach((attr) => {
          if (attr.Name && attr.Value) {
            attrs[attr.Name] = attr.Value;
          }
        });

        // Get groups for this user
        let groups: string[] = [];
        try {
          const groupsResult = await cognitoClient.send(
            new AdminListGroupsForUserCommand({
              UserPoolId: USER_POOL_ID,
              Username: user.Username!,
            })
          );
          groups = (groupsResult.Groups || []).map((g) => g.GroupName!);
        } catch (err) {
          console.error(`Failed to get groups for ${user.Username}:`, err);
        }

        return {
          username: user.Username,
          email: attrs['email'] || '',
          name: attrs['name'] || '',
          wrestlerName: attrs['custom:wrestler_name'] || '',
          status: user.UserStatus,
          enabled: user.Enabled,
          created: user.UserCreateDate?.toISOString(),
          groups,
        };
      })
    );

    return success({ users });
  } catch (error) {
    console.error('List users error:', error);
    return serverError('Failed to list users');
  }
};
