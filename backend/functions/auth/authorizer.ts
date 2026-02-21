import { APIGatewayTokenAuthorizerHandler, APIGatewayAuthorizerResult } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

const getVerifier = () => {
  if (verifier) return verifier;

  const userPoolId = process.env.COGNITO_USER_POOL_ID!;
  const clientId = process.env.COGNITO_CLIENT_ID!;
  verifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: 'access',
    clientId,
  });
  return verifier;
};

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

  // Offline mode: skip JWT verification, allow all requests as Admin.
  // This must run before token presence/format checks so local development
  // works even when the frontend does not have Cognito tokens.
  if (process.env.IS_OFFLINE === 'true') {
    console.log('Offline mode: bypassing JWT verification');
    const resource = event.methodArn.split('/').slice(0, 2).join('/') + '/*';
    return generatePolicy('offline-admin', 'Allow', resource, {
      username: 'offline-admin',
      email: 'admin@dev.local',
      groups: 'Admin',
    });
  }

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

  try {
    // Verify the Cognito JWT token
    const payload = await getVerifier().verify(token);
    console.log('Token verified for user:', payload.sub);

    // Extract cognito:groups from the access token
    const groups = (payload['cognito:groups'] as string[] | undefined) || [];
    const groupsStr = groups.join(',');
    const username = typeof payload.username === 'string' ? payload.username : payload.sub;
    const email = typeof payload.email === 'string' ? payload.email : '';

    // Generate an Allow policy for all resources
    const resource = event.methodArn.split('/').slice(0, 2).join('/') + '/*';

    return generatePolicy(payload.sub, 'Allow', resource, {
      username,
      email,
      groups: groupsStr,
    });
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Unauthorized');
  }
};
