import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { AuthenticateResult } from '../authenticate';

type Authenticate = (event: APIGatewayProxyEvent) => Promise<AuthenticateResult>;

/**
 * Test stand-in for lib/authenticate, for tests that build a verified caller's
 * context directly instead of sending a token. A request whose
 * requestContext.authorizer already has a principalId counts as verified, as if
 * authenticate() had just checked its token; any other request goes to
 * `fallback` (the real authenticate, or a stub).
 *
 * Production has no such path: lib/router dispatch calls authenticate() for
 * every non-public route and does not trust a preset principal.
 */
export function presetCallerAuthenticate(fallback: Authenticate): Authenticate {
  return async (event) => {
    if (event.requestContext?.authorizer?.principalId) return { ok: true };
    return fallback(event);
  };
}
