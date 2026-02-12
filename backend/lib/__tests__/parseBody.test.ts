import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { parseBody } from '../parseBody';

function makeEvent(body: string | null): APIGatewayProxyEvent {
  return {
    body,
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
    requestContext: {} as any,
  };
}

describe('parseBody', () => {
  it('parses valid JSON and returns data', () => {
    const event = makeEvent(JSON.stringify({ name: 'Test', count: 42 }));

    const result = parseBody(event);

    expect(result.data).toEqual({ name: 'Test', count: 42 });
    expect(result.error).toBeUndefined();
  });

  it('returns 400 error when body is null', () => {
    const event = makeEvent(null);

    const result = parseBody(event);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error!.statusCode).toBe(400);
    expect(JSON.parse(result.error!.body).message).toBe('Request body is required');
  });

  it('returns 400 error for malformed JSON', () => {
    const event = makeEvent('not-valid-json{');

    const result = parseBody(event);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error!.statusCode).toBe(400);
    expect(JSON.parse(result.error!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns typed data when generic parameter is provided', () => {
    interface MyPayload { email: string; age: number }
    const event = makeEvent(JSON.stringify({ email: 'a@b.com', age: 30 }));

    const result = parseBody<MyPayload>(event);

    expect(result.data?.email).toBe('a@b.com');
    expect(result.data?.age).toBe(30);
  });
});
