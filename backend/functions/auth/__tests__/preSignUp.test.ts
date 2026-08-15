import { describe, it, expect } from 'vitest';
import type { PreSignUpTriggerEvent, Context, Callback } from 'aws-lambda';

import { handler } from '../preSignUp';

function makePreSignUpEvent(
  userAttributes: Record<string, string>
): PreSignUpTriggerEvent {
  return {
    version: '1',
    region: 'us-east-1',
    userPoolId: 'us-east-1_test',
    userName: 'test-user',
    callerContext: {
      awsSdkVersion: 'aws-sdk-js-3',
      clientId: 'test-client-id',
    },
    triggerSource: 'PreSignUp_SignUp',
    request: {
      userAttributes,
      validationData: {},
    },
    response: {
      autoConfirmUser: false,
      autoVerifyEmail: false,
      autoVerifyPhone: false,
    },
  };
}

describe('preSignUp handler', () => {
  it('auto-confirms the user and auto-verifies their email', async () => {
    const event = makePreSignUpEvent({ email: 'wrestler@example.com' });

    const result = (await handler(
      event,
      {} as Context,
      {} as Callback
    )) as PreSignUpTriggerEvent;

    expect(result.response.autoConfirmUser).toBe(true);
    expect(result.response.autoVerifyEmail).toBe(true);
  });

  it('auto-confirms without verifying email when no email attribute exists', async () => {
    const event = makePreSignUpEvent({});

    const result = (await handler(
      event,
      {} as Context,
      {} as Callback
    )) as PreSignUpTriggerEvent;

    expect(result.response.autoConfirmUser).toBe(true);
    expect(result.response.autoVerifyEmail).toBe(false);
  });
});
