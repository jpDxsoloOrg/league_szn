import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { success, badRequest, serverError } from '../../lib/response';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

interface CreateAdminRequest {
  email: string;
  password: string;
  name?: string;
  setupKey: string;
}

// Setup key to prevent unauthorized admin creation
// In production, this should be a secure environment variable
const SETUP_KEY = process.env.ADMIN_SETUP_KEY || 'league-szn-setup-2024';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const { email, password, name, setupKey }: CreateAdminRequest = JSON.parse(event.body);

    // Validate setup key
    if (setupKey !== SETUP_KEY) {
      return badRequest('Invalid setup key');
    }

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
    } catch (error: any) {
      // UserNotFoundException means we can create the user
      if (error.name !== 'UserNotFoundException') {
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
  } catch (error) {
    console.error('Create admin user error:', error);
    return serverError('Failed to create admin user');
  }
};
