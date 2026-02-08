import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const { username, enabled } = JSON.parse(event.body) as {
      username: string;
      enabled: boolean;
    };

    if (!username || typeof enabled !== 'boolean') {
      return badRequest('username and enabled (boolean) are required');
    }

    if (enabled) {
      await cognitoClient.send(
        new AdminEnableUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
        })
      );
    } else {
      await cognitoClient.send(
        new AdminDisableUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
        })
      );
    }

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
