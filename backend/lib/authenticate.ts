import { APIGatewayProxyEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

const getVerifier = () => {
  if (verifier) return verifier;
  verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID!,
    tokenUse: 'access',
    clientId: process.env.COGNITO_CLIENT_ID!,
  });
  return verifier;
};

export type AuthenticateResult = { ok: true } | { ok: false };

/**
 * Verify the Cognito JWT from the Authorization header and populate
 * event.requestContext.authorizer with the same shape the Lambda token
 * authorizer produces (principalId, username, email, groups). Handlers can
 * then continue using getAuthContext / requireRole unchanged.
 *
 * In offline mode the JWT check is skipped and a synthetic Admin context is
 * installed, matching the behaviour of functions/auth/authorizer.ts.
 */
export async function authenticate(event: APIGatewayProxyEvent): Promise<AuthenticateResult> {
  if (process.env.IS_OFFLINE === 'true') {
    event.requestContext.authorizer = {
      ...(event.requestContext.authorizer || {}),
      principalId: 'offline-admin',
      username: 'offline-admin',
      email: 'admin@dev.local',
      groups: 'Admin',
    };
    return { ok: true };
  }

  const header = event.headers?.Authorization || event.headers?.authorization || '';
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') {
    return { ok: false };
  }

  try {
    const payload = await getVerifier().verify(token);
    const groups = (payload['cognito:groups'] as string[] | undefined) || [];
    const username = typeof payload.username === 'string' ? payload.username : payload.sub;
    const email = typeof payload.email === 'string' ? payload.email : '';
    event.requestContext.authorizer = {
      ...(event.requestContext.authorizer || {}),
      principalId: payload.sub,
      username,
      email,
      groups: groups.join(','),
    };
    return { ok: true };
  } catch (err) {
    console.error('JWT verification failed:', err);
    return { ok: false };
  }
}
