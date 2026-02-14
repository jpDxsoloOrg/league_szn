import { APIGatewayTokenAuthorizerHandler, APIGatewayAuthorizerResult } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID!;

// Create a verifier that expects valid access tokens from Cognito
const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'access',
  clientId: CLIENT_ID,
});

const generatePolicy = (
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string | number | boolean>
): APIGatewayAuthorizerResult => {
  const policy: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };

  if (context) {
    policy.context = context;
  }

  return policy;
};

export const handler: APIGatewayTokenAuthorizerHandler = async (event) => {
  console.log('Authorizer event:', JSON.stringify(event, null, 2));

  const authorizationToken = event.authorizationToken;

  if (!authorizationToken) {
    console.log('No authorization token provided');
    throw new Error('Unauthorized');
  }

  // Extract the token from "Bearer <token>" format
  const tokenParts = authorizationToken.split(' ');
  if (tokenParts.length !== 2 || tokenParts[0].toLowerCase() !== 'bearer') {
    console.log('Invalid token format');
    throw new Error('Unauthorized');
  }

  const token = tokenParts[1];

  // Offline mode: skip JWT verification, allow all requests as Admin
  if (process.env.IS_OFFLINE === 'true') {
    console.log('Offline mode: bypassing JWT verification');
    const resource = event.methodArn.split('/').slice(0, 2).join('/') + '/*';
    return generatePolicy('offline-admin', 'Allow', resource, {
      username: 'offline-admin',
      email: 'admin@dev.local',
      groups: 'Admin',
    });
  }

  try {
    // Verify the Cognito JWT token
    const payload = await verifier.verify(token);
    console.log('Token verified for user:', payload.sub);

    // Extract cognito:groups from the access token
    const groups = (payload['cognito:groups'] as string[] | undefined) || [];
    const groupsStr = groups.join(',');

    // Generate an Allow policy for all resources
    const resource = event.methodArn.split('/').slice(0, 2).join('/') + '/*';

    return generatePolicy(payload.sub, 'Allow', resource, {
      username: payload.username || payload.sub,
      email: (payload['email'] as string) || '',
      groups: groupsStr,
    });
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Unauthorized');
  }
};
