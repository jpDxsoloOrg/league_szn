import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayTokenAuthorizerEvent, Context, Callback } from 'aws-lambda';

// vi.hoisted ensures mockVerify exists when vi.mock factory runs (hoisted above imports)
const { mockVerify } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
}));

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: () => ({
      verify: mockVerify,
    }),
  },
}));

// Import after mocking
import { handler } from '../authorizer';

function makeAuthorizerEvent(
  token?: string,
  methodArn = 'arn:aws:execute-api:us-east-1:123456:abc/prod/GET/test'
): APIGatewayTokenAuthorizerEvent {
  return {
    type: 'TOKEN',
    authorizationToken: token ?? '',
    methodArn,
  };
}

const dummyContext = {} as Context;
const dummyCallback: Callback = () => {};

describe('authorizer handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns Allow policy with context for a valid Bearer token', async () => {
    mockVerify.mockResolvedValue({
      sub: 'user-sub-123',
      username: 'john',
      email: 'john@example.com',
      'cognito:groups': ['Admin', 'Wrestler'],
    });

    const event = makeAuthorizerEvent('Bearer valid-jwt-token');
    const result = await handler(event, dummyContext, dummyCallback);

    expect(mockVerify).toHaveBeenCalledWith('valid-jwt-token');
    expect(result).toEqual({
      principalId: 'user-sub-123',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: 'arn:aws:execute-api:us-east-1:123456:abc/prod/*',
          },
        ],
      },
      context: {
        username: 'john',
        email: 'john@example.com',
        groups: 'Admin,Wrestler',
      },
    });
  });

  it('handles user with no groups', async () => {
    mockVerify.mockResolvedValue({
      sub: 'user-sub-456',
      username: 'newuser',
      email: 'new@example.com',
    });

    const event = makeAuthorizerEvent('Bearer token-no-groups');
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result).toMatchObject({
      principalId: 'user-sub-456',
      context: {
        username: 'newuser',
        groups: '',
      },
    });
  });

  it('throws Unauthorized when no token is provided', async () => {
    const event = makeAuthorizerEvent('');

    await expect(handler(event, dummyContext, dummyCallback)).rejects.toThrow('Unauthorized');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('throws Unauthorized for non-Bearer format', async () => {
    const event = makeAuthorizerEvent('Basic abc123');

    await expect(handler(event, dummyContext, dummyCallback)).rejects.toThrow('Unauthorized');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('throws Unauthorized for token with extra parts', async () => {
    const event = makeAuthorizerEvent('Bearer token extra');

    await expect(handler(event, dummyContext, dummyCallback)).rejects.toThrow('Unauthorized');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when token verification fails', async () => {
    mockVerify.mockRejectedValue(new Error('Token expired'));

    const event = makeAuthorizerEvent('Bearer expired-token');

    await expect(handler(event, dummyContext, dummyCallback)).rejects.toThrow('Unauthorized');
    expect(mockVerify).toHaveBeenCalledWith('expired-token');
  });

  it('uses sub as username when username claim is missing', async () => {
    mockVerify.mockResolvedValue({
      sub: 'sub-fallback',
      'cognito:groups': [],
    });

    const event = makeAuthorizerEvent('Bearer token-no-username');
    const result = await handler(event, dummyContext, dummyCallback);

    expect(result).toMatchObject({
      principalId: 'sub-fallback',
      context: {
        username: 'sub-fallback',
        email: '',
        groups: '',
      },
    });
  });
});
