import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PostConfirmationTriggerEvent, Context, Callback } from 'aws-lambda';

// Mock the Cognito SDK
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  AdminAddUserToGroupCommand: vi.fn((params: any) => ({ input: params })),
}));

import { handler } from '../postConfirmation';

function makePostConfirmationEvent(
  overrides: Partial<PostConfirmationTriggerEvent> = {}
): PostConfirmationTriggerEvent {
  return {
    version: '1',
    region: 'us-east-1',
    userPoolId: 'us-east-1_TestPool',
    userName: 'testuser',
    callerContext: {
      awsSdkVersion: '3.0.0',
      clientId: 'test-client-id',
    },
    triggerSource: 'PostConfirmation_ConfirmSignUp',
    request: {
      userAttributes: {
        sub: 'sub-123',
        email: 'test@example.com',
      },
    },
    response: {},
    ...overrides,
  };
}

const dummyContext = {} as Context;
const dummyCallback: Callback = () => {};

describe('postConfirmation handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds user to Fantasy group and returns the event', async () => {
    mockSend.mockResolvedValue({});

    const event = makePostConfirmationEvent();
    const result = await handler(event, dummyContext, dummyCallback);

    expect(mockSend).toHaveBeenCalledOnce();
    const command = mockSend.mock.calls[0][0];
    expect(command.input).toEqual({
      UserPoolId: 'us-east-1_TestPool',
      Username: 'testuser',
      GroupName: 'Fantasy',
    });
    expect(result).toEqual(event);
  });

  it('does not throw when Cognito SDK fails (non-blocking)', async () => {
    mockSend.mockRejectedValue(new Error('Cognito service unavailable'));

    const event = makePostConfirmationEvent();
    const result = await handler(event, dummyContext, dummyCallback);

    // Should still return the event, not throw
    expect(result).toEqual(event);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('uses the correct userPoolId and userName from the event', async () => {
    mockSend.mockResolvedValue({});

    const event = makePostConfirmationEvent({
      userPoolId: 'eu-west-1_CustomPool',
      userName: 'custom-user@test.com',
    });
    await handler(event, dummyContext, dummyCallback);

    const command = mockSend.mock.calls[0][0];
    expect(command.input).toEqual({
      UserPoolId: 'eu-west-1_CustomPool',
      Username: 'custom-user@test.com',
      GroupName: 'Fantasy',
    });
  });
});
