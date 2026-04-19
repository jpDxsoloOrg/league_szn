import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

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

    // Verify the user is disabled before allowing deletion
    const userResult = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      })
    );

    if (userResult.Enabled) {
      return badRequest('User must be disabled before deletion. Disable the user first.');
    }

    await cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      })
    );

    return success({
      message: `User ${username} has been permanently deleted`,
      username,
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return serverError('Failed to delete user');
  }
};
