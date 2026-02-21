import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { success, badRequest, unauthorized, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

const cognitoClient = new CognitoIdentityProviderClient({});
const CLIENT_ID = process.env.COGNITO_CLIENT_ID!;

interface LoginRequest {
  username: string;
  password: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody<LoginRequest>(event);
    if (parseError) return parseError;
    const { username, password } = body;

    if (!username || !password) {
      return badRequest('Username and password are required');
    }

    const result = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      })
    );

    if (!result.AuthenticationResult) {
      return unauthorized('Authentication failed');
    }

    return success({
      accessToken: result.AuthenticationResult.AccessToken,
      idToken: result.AuthenticationResult.IdToken,
      refreshToken: result.AuthenticationResult.RefreshToken,
      expiresIn: result.AuthenticationResult.ExpiresIn,
      tokenType: result.AuthenticationResult.TokenType,
    });
  } catch (error: unknown) {
    const cognitoError = error as Error & { name?: string };
    if (cognitoError.name === 'NotAuthorizedException' || cognitoError.name === 'UserNotFoundException') {
      return unauthorized('Invalid username or password');
    }
    console.error('Login error:', error);
    return serverError('Login failed');
  }
};
