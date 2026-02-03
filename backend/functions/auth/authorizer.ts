import { APIGatewayTokenAuthorizerHandler, APIGatewayAuthorizerResult } from 'aws-lambda';
import { verifyToken, AdminTokenPayload } from '../../lib/jwt';

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

  try {
    // Verify the JWT token
    const decoded: AdminTokenPayload = verifyToken(token);
    console.log('Token verified for user:', decoded.username);

    // Check if the user has admin role
    if (decoded.role !== 'admin') {
      console.log('User does not have admin role');
      throw new Error('Unauthorized');
    }

    // Generate an Allow policy for all resources (you can be more restrictive if needed)
    // Using a wildcard to allow access to all methods and resources in the API
    const resource = event.methodArn.split('/').slice(0, 2).join('/') + '/*';

    return generatePolicy(decoded.username, 'Allow', resource, {
      username: decoded.username,
      role: decoded.role,
    });
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Unauthorized');
  }
};
