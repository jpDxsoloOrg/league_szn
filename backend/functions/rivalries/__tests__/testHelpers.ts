import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

export const ctx = {} as Context;
export const cb: Callback = () => undefined;

export function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

export function withAuth(
  event: APIGatewayProxyEvent,
  groups: string,
  sub = 'user-sub-1',
  username = 'tester',
): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: {
        groups,
        username,
        email: `${username}@test.test`,
        principalId: sub,
      },
    } as APIGatewayProxyEvent['requestContext'],
  };
}
