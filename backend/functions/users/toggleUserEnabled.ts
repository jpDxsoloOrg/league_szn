import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { success, badRequest, refused, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { isDeactivated } from '../../lib/discipline';
import { findPlayerForCognitoUsername } from '../../lib/disciplineActions';

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
      // The Player row decides access, so a login cannot be turned back on
      // around it. A lookup error lands in the catch, with nothing enabled.
      const player = await findPlayerForCognitoUsername(username);
      if (player && isDeactivated(player)) {
        return refused(409, 'PLAYER_DEACTIVATED', 'This player is deactivated. Reactivate them from Manage Players.');
      }

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
