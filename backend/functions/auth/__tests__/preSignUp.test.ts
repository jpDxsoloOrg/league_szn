import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PreSignUpTriggerEvent, Context, Callback } from 'aws-lambda';

const { mockScanAll } = vi.hoisted(() => ({ mockScanAll: vi.fn() }));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: { scanAll: mockScanAll },
  TableNames: { PLAYERS: 'Players' },
}));

import { handler } from '../preSignUp';

const DAY_MS = 24 * 60 * 60 * 1000;
const REFUSED = 'This account cannot be registered. Please contact an administrator.';

const strike = (daysAgo: number) => ({
  strikeId: `strike-${daysAgo}`,
  issuedAt: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
  issuedBy: 'admin',
  issuedByName: 'Admin',
  reason: 'Missed the show',
});

const blockedRow = {
  playerId: 'p1',
  strikes: [strike(3), strike(1)],
  signupGuardKey: 'struck@example.com',
  psnId: 'Struck_PSN',
};

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

const run = (userAttributes: Record<string, string>) =>
  handler(makePreSignUpEvent(userAttributes), {} as Context, {} as Callback) as Promise<PreSignUpTriggerEvent>;

beforeEach(() => {
  mockScanAll.mockReset();
  mockScanAll.mockResolvedValue([]);
});

afterEach(() => vi.restoreAllMocks());

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

describe('preSignUp signup guard', () => {
  it.each([
    ['a matching guard key', { email: 'struck@example.com' }],
    ['a case-changed email', { email: 'STRUCK@Example.com' }],
    ['a +tag variant', { email: 'struck+again@example.com' }],
    ['a matching PSN ID', { email: 'new@example.com', 'custom:psn_id': 'struck_psn' }],
  ])('refuses %s while blocked', async (_label, attributes) => {
    mockScanAll.mockResolvedValue([blockedRow]);
    await expect(run(attributes)).rejects.toThrow(REFUSED);
  });

  it('refuses while deactivated, however old the strikes', async () => {
    mockScanAll.mockResolvedValue([{
      ...blockedRow,
      strikes: [strike(100)],
      deactivatedAt: new Date().toISOString(),
    }]);
    await expect(run({ email: 'struck@example.com' })).rejects.toThrow(REFUSED);
  });

  it('allows the signup once a block has ended', async () => {
    mockScanAll.mockResolvedValue([{ ...blockedRow, strikes: [strike(10), strike(8)] }]);
    const result = await run({ email: 'struck@example.com' });
    expect(result.response.autoConfirmUser).toBe(true);
  });

  it('allows the signup on a lookup error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockScanAll.mockRejectedValue(new Error('throttled'));
    const result = await run({ email: 'struck@example.com' });
    expect(result.response.autoConfirmUser).toBe(true);
  });
});
