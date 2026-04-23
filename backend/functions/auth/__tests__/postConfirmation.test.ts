import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PostConfirmationTriggerEvent, Context, Callback } from 'aws-lambda';

// Mock the Cognito SDK
const { mockSend, mockPlayers, mockWrestlers, mockRunInTransaction } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockPlayers: {
    findByUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  mockWrestlers: {
    list: vi.fn(),
  },
  mockRunInTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      assignWrestlerToPlayer: vi.fn(),
      updatePlayer: vi.fn(),
    };
    // Capture the tx calls so tests can assert on them.
    (mockRunInTransaction as unknown as { lastTx?: typeof tx }).lastTx = tx;
    return fn(tx);
  }),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  AdminAddUserToGroupCommand: vi.fn((params: any) => ({ input: params })),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: { players: mockPlayers, wrestlers: mockWrestlers },
    runInTransaction: mockRunInTransaction,
  }),
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
    mockPlayers.findByUserId.mockResolvedValue(null);
    mockPlayers.create.mockResolvedValue({ playerId: 'p-new' });
    mockPlayers.update.mockResolvedValue({ playerId: 'p-new' });
    mockWrestlers.list.mockResolvedValue([]);
  });

  it('adds user to Wrestler group and returns the event', async () => {
    mockSend.mockResolvedValue({});

    const event = makePostConfirmationEvent();
    const result = await handler(event, dummyContext, dummyCallback);

    expect(mockSend).toHaveBeenCalledOnce();
    const command = mockSend.mock.calls[0][0];
    expect(command.input).toEqual({
      UserPoolId: 'us-east-1_TestPool',
      Username: 'testuser',
      GroupName: 'Wrestler',
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
      GroupName: 'Wrestler',
    });
  });

  it('links the Player to the matching available Wrestler via a UoW transaction', async () => {
    mockSend.mockResolvedValue({});
    mockWrestlers.list.mockResolvedValue([
      {
        wrestlerId: 'w-rock',
        promotion: 'WWE',
        name: 'The Rock',
        overallCap: 93,
        isInUse: false,
      },
      {
        wrestlerId: 'w-cena',
        promotion: 'WWE',
        name: 'John Cena',
        overallCap: 89,
        isInUse: false,
      },
    ]);
    mockPlayers.create.mockResolvedValue({ playerId: 'p-new' });

    const event = makePostConfirmationEvent({
      request: {
        userAttributes: {
          sub: 'sub-123',
          email: 'test@example.com',
          'custom:wrestler_name': 'The Rock',
          'custom:player_name': 'TestPlayer',
          'custom:psn_id': 'PSN123',
        },
      },
    });

    await handler(event, dummyContext, dummyCallback);

    expect(mockPlayers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'TestPlayer',
        currentWrestler: 'The Rock',
        psnId: 'PSN123',
      }),
    );
    expect(mockRunInTransaction).toHaveBeenCalled();
    const tx = (mockRunInTransaction as unknown as { lastTx: { assignWrestlerToPlayer: ReturnType<typeof vi.fn>; updatePlayer: ReturnType<typeof vi.fn> } }).lastTx;
    expect(tx.assignWrestlerToPlayer).toHaveBeenCalledWith({
      wrestlerId: 'w-rock',
      playerId: 'p-new',
      slot: 'primary',
    });
    expect(tx.updatePlayer).toHaveBeenCalledWith('p-new', {
      userId: 'sub-123',
      currentWrestlerId: 'w-rock',
    });
    // When the UoW path runs, the non-transactional fallback update is skipped.
    expect(mockPlayers.update).not.toHaveBeenCalled();
  });

  it('falls back to non-FK player.update when the picked wrestler is already in use', async () => {
    mockSend.mockResolvedValue({});
    mockWrestlers.list.mockResolvedValue([
      {
        wrestlerId: 'w-rock',
        promotion: 'WWE',
        name: 'The Rock',
        overallCap: 93,
        isInUse: true,
        assignedPlayerId: 'other',
      },
    ]);
    mockPlayers.create.mockResolvedValue({ playerId: 'p-new' });

    const event = makePostConfirmationEvent({
      request: {
        userAttributes: {
          sub: 'sub-123',
          email: 't@t.com',
          'custom:wrestler_name': 'The Rock',
          'custom:player_name': 'TestPlayer',
        },
      },
    });

    await handler(event, dummyContext, dummyCallback);

    expect(mockRunInTransaction).not.toHaveBeenCalled();
    expect(mockPlayers.update).toHaveBeenCalledWith('p-new', { userId: 'sub-123' });
  });

  it('falls back to non-FK player.update when the wrestler name does not match any roster entry', async () => {
    mockSend.mockResolvedValue({});
    mockWrestlers.list.mockResolvedValue([
      {
        wrestlerId: 'w-rock',
        promotion: 'WWE',
        name: 'The Rock',
        overallCap: 93,
        isInUse: false,
      },
    ]);
    mockPlayers.create.mockResolvedValue({ playerId: 'p-new' });

    const event = makePostConfirmationEvent({
      request: {
        userAttributes: {
          sub: 'sub-123',
          email: 't@t.com',
          'custom:wrestler_name': 'Nobody Important',
          'custom:player_name': 'TestPlayer',
        },
      },
    });

    await handler(event, dummyContext, dummyCallback);

    expect(mockRunInTransaction).not.toHaveBeenCalled();
    expect(mockPlayers.update).toHaveBeenCalledWith('p-new', { userId: 'sub-123' });
  });
});
