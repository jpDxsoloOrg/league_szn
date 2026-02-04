import { APIGatewayProxyHandler } from 'aws-lambda';
import { timingSafeEqual } from 'crypto';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { success, badRequest, serverError, unauthorized } from '../../lib/response';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

interface CreateAdminRequest {
  email: string;
  password: string;
  name?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  // Validate setup key FIRST - before any other operations
  // This prevents unauthorized access to the admin creation endpoint
  const setupKey = event.headers['x-setup-key'] || event.headers['X-Setup-Key'];
  const expectedKey = process.env.ADMIN_SETUP_KEY;

  if (!expectedKey || !setupKey) {
    return unauthorized('Invalid or missing setup key');
  }

  // Use constant-time comparison to prevent timing attacks
  try {
    const keyBuffer = Buffer.from(setupKey);
    const expectedBuffer = Buffer.from(expectedKey);
    if (keyBuffer.length !== expectedBuffer.length || !timingSafeEqual(keyBuffer, expectedBuffer)) {
      return unauthorized('Invalid or missing setup key');
    }
  } catch {
    return unauthorized('Invalid or missing setup key');
  }

  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    let parsedBody: CreateAdminRequest;
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      return badRequest('Invalid JSON in request body');
    }

    const { email, password, name } = parsedBody;

    if (!email || !password) {
      return badRequest('Email and password are required');
    }

    // Validate password requirements
    if (password.length < 8) {
      return badRequest('Password must be at least 8 characters');
    }

    // Check if user already exists
    try {
      await cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
        })
      );
      return badRequest('Admin user already exists');
    } catch (error: unknown) {
      // UserNotFoundException means we can create the user
      const cognitoError = error as Error & { name?: string };
      if (cognitoError.name !== 'UserNotFoundException') {
        throw error;
      }
    }

    // Create the admin user
    await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          ...(name ? [{ Name: 'name', Value: name }] : []),
        ],
        MessageAction: 'SUPPRESS', // Don't send welcome email
      })
    );

    // Set permanent password (skip temporary password flow)
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true,
      })
    );

    return success({
      message: 'Admin user created successfully',
      email,
    });
  } catch (error: unknown) {
    console.error('Create admin user error:', error);
    return serverError('Failed to create admin user');
  }
};
