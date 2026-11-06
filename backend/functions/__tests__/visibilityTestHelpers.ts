import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import type { AuthenticateResult } from '../../lib/authenticate';
import type { Repositories } from '../../lib/repositories';
import { NEEDS_WRESTLER } from '../../lib/needsWrestler';

const ctx = {} as Context;

export function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

/** Headers for a caller whose token `fakeAuthenticate` will accept. */
export function bearer(sub: string, groups: string): Pick<APIGatewayProxyEvent, 'headers'> {
  return { headers: { Authorization: `Bearer ${sub}|${groups}` } };
}

/** Stand-in for lib/authenticate: `Bearer invalid` fails, as a bad JWT would. */
export async function fakeAuthenticate(event: APIGatewayProxyEvent): Promise<AuthenticateResult> {
  const token = (event.headers.Authorization ?? '').replace('Bearer ', '');
  if (token === 'invalid') return { ok: false };
  const [principalId, groups] = token.split('|');
  event.requestContext.authorizer = { principalId, groups, username: principalId, email: '' };
  return { ok: true };
}

/** A request that already passed the router's auth step. */
export function authedEvent(
  sub: string,
  groups: string,
  overrides: Partial<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return makeEvent({
    ...overrides,
    requestContext: {
      authorizer: { principalId: sub, groups, username: sub, email: '' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  });
}

export async function call<TBody>(
  handler: APIGatewayProxyHandler,
  event: APIGatewayProxyEvent,
): Promise<{ statusCode: number; body: TBody }> {
  const result = (await handler(event, ctx, () => {})) as APIGatewayProxyResult;
  return { statusCode: result.statusCode, body: JSON.parse(result.body) as TBody };
}

export interface RosterSeed {
  /** Has a real wrestler name. */
  visibleId: string;
  /** Holds the NEEDS_WRESTLER placeholder. */
  placeholderId: string;
  /** Holds a whitespace-only name. */
  blankId: string;
}

export async function seedRoster(repos: Repositories): Promise<RosterSeed> {
  const create = async (name: string, currentWrestler: string): Promise<string> =>
    (await repos.roster.players.create({ name, currentWrestler })).playerId;
  return {
    visibleId: await create('Visible Person', 'The Rock'),
    placeholderId: await create('Placeholder Person', NEEDS_WRESTLER),
    blankId: await create('Blank Person', '   '),
  };
}
