import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// Mock Cognito SDK
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  AdminCreateUserCommand: vi.fn((params: any) => ({ _type: 'CreateUser', input: params })),
  AdminSetUserPasswordCommand: vi.fn((params: any) => ({ _type: 'SetPassword', input: params })),
  AdminGetUserCommand: vi.fn((params: any) => ({ _type: 'GetUser', input: params })),
  AdminAddUserToGroupCommand: vi.fn((params: any) => ({ _type: 'AddToGroup', input: params })),
}));

import { handler } from '../createAdminUser';

const VALID_SETUP_KEY = 'test-setup-key-123';

function makeEvent(overrides: {
  setupKey?: string | null;
  body?: string | null;
  headers?: Record<string, string>;
} = {}): APIGatewayProxyEvent {
  const headers: Record<string, string> = overrides.headers ?? {};
  if (overrides.setupKey !== null) {
    headers['x-setup-key'] = overrides.setupKey ?? VALID_SETUP_KEY;
  }

  return {
    body: 'body' in overrides ? overrides.body! : JSON.stringify({ email: 'admin@example.com', password: 'SecureP@ss1' }),
    headers,
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/auth/create-admin',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {} as any,
  };
}

const dummyContext = {} as Context;
const dummyCallback: Callback = () => {};

describe('createAdminUser handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_SETUP_KEY', VALID_SETUP_KEY);
    vi.stubEnv('COGNITO_USER_POOL_ID', 'us-east-1_TestPool');
  });

  // ─── Setup key validation ──────────────────────────────────────────

  it('returns 401 when setup key is missing', async () => {
    const event = makeEvent({ setupKey: null, headers: {} });
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result!.statusCode).toBe(401);
    expect(JSON.parse(result!.body).message).toBe('Invalid or missing setup key');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 401 when setup key is wrong', async () => {
    const event = makeEvent({ setupKey: 'wrong-key' });
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result!.statusCode).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 401 when ADMIN_SETUP_KEY env var is not set', async () => {
    vi.stubEnv('ADMIN_SETUP_KEY', '');
    const event = makeEvent();
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result!.statusCode).toBe(401);
  });

  // ─── Body validation ───────────────────────────────────────────────

  it('returns 400 when body is missing', async () => {
    const event = makeEvent({ body: null });
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 for invalid JSON body', async () => {
    const event = makeEvent({ body: 'not-json{' });
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 when email is missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ password: 'Pass1234' }) });
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Email and password are required');
  });

  it('returns 400 when password is too short', async () => {
    const event = makeEvent({
      body: JSON.stringify({ email: 'a@b.com', password: 'short' }),
    });
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Password must be at least 8 characters');
  });

  // ─── Duplicate user ────────────────────────────────────────────────

  it('returns 400 when user already exists', async () => {
    // AdminGetUser succeeds → user exists
    mockSend.mockResolvedValueOnce({ Username: 'admin@example.com' });

    const event = makeEvent();
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Admin user already exists');
    expect(mockSend).toHaveBeenCalledOnce(); // Only GetUser, no Create
  });

  // ─── Happy path ────────────────────────────────────────────────────

  it('creates admin user successfully', async () => {
    // AdminGetUser throws UserNotFoundException → user does not exist
    const notFoundError = new Error('User not found');
    (notFoundError as any).name = 'UserNotFoundException';
    mockSend
      .mockRejectedValueOnce(notFoundError) // GetUser → not found
      .mockResolvedValueOnce({})             // CreateUser
      .mockResolvedValueOnce({})             // SetPassword
      .mockResolvedValueOnce({});            // AddToGroup

    const event = makeEvent({
      body: JSON.stringify({ email: 'newadmin@example.com', password: 'Str0ngP@ss', name: 'Admin User' }),
    });
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      message: 'Admin user created successfully',
      email: 'newadmin@example.com',
    });

    // Verify all 4 Cognito calls were made
    expect(mockSend).toHaveBeenCalledTimes(4);

    // Verify AddToGroup was called with Admin group
    const addToGroupCmd = mockSend.mock.calls[3][0];
    expect(addToGroupCmd.input.GroupName).toBe('Admin');
  });

  // ─── Error handling ────────────────────────────────────────────────

  it('returns 500 when Cognito throws unexpected error during user check', async () => {
    const unexpectedError = new Error('Service unavailable');
    (unexpectedError as any).name = 'ServiceUnavailableException';
    mockSend.mockRejectedValueOnce(unexpectedError);

    const event = makeEvent();
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to create admin user');
  });
});
