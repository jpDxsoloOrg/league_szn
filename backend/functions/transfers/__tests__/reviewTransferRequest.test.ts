import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Callback, Context } from 'aws-lambda';

const { mockTransfers, mockPlayers, mockCreateNotification } = vi.hoisted(() => ({
  mockTransfers: { findById: vi.fn(), review: vi.fn() },
  mockPlayers: { update: vi.fn(), findById: vi.fn() },
  mockCreateNotification: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: { players: mockPlayers, transfers: mockTransfers },
  }),
}));

vi.mock('../../../lib/notifications', () => ({
  createNotification: mockCreateNotification,
}));

import { handler as reviewTransferRequest } from '../reviewTransferRequest';

const ctx = {} as Context;
const cb: Callback = () => {};

function event(status: 'approved' | 'rejected'): APIGatewayProxyEvent {
  return {
    body: JSON.stringify({ status }),
    headers: {},
    pathParameters: { requestId: 'r1' },
    requestContext: {
      authorizer: { groups: 'Admin', username: 'admin', email: 'a@test.com', principalId: 'sub-admin' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('reviewTransferRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransfers.findById.mockResolvedValue({
      requestId: 'r1', playerId: 'p1', fromDivisionId: 'd1', toDivisionId: 'd2', status: 'pending',
    });
    mockTransfers.review.mockResolvedValue({ requestId: 'r1', updatedAt: '2026-11-12T00:00:00.000Z' });
    mockPlayers.update.mockResolvedValue({});
    mockPlayers.findById.mockResolvedValue({ playerId: 'p1' });
  });

  it('moves the player and stamps divisionJoinedAt on approval', async () => {
    const result = await reviewTransferRequest(event('approved'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockPlayers.update).toHaveBeenCalledWith('p1', {
      divisionId: 'd2',
      divisionJoinedAt: expect.any(String),
    });
    const [, patch] = mockPlayers.update.mock.calls[0];
    expect(Date.parse(patch.divisionJoinedAt)).not.toBeNaN();
  });

  it('leaves the player alone on rejection', async () => {
    const result = await reviewTransferRequest(event('rejected'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockPlayers.update).not.toHaveBeenCalled();
  });
});
