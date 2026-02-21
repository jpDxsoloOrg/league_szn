import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

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
