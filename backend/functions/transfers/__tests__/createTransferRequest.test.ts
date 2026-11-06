import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Callback, Context } from 'aws-lambda';

const { mockGetFeatures, mockTransfers, mockPlayers, mockDivisions } = vi.hoisted(() => ({
  mockGetFeatures: vi.fn(),
  mockTransfers: { create: vi.fn(), listPendingByPlayer: vi.fn() },
  mockPlayers: { findByUserId: vi.fn() },
  mockDivisions: { findById: vi.fn() },
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    user: { siteConfig: { getFeatures: mockGetFeatures } },
    roster: { players: mockPlayers, transfers: mockTransfers },
    leagueOps: { divisions: mockDivisions },
  }),
}));

import { handler as createTransferRequest } from '../createTransferRequest';

const ctx = {} as Context;
const cb: Callback = () => {};

function event(groups = 'Wrestler'): APIGatewayProxyEvent {
  return {
    body: JSON.stringify({ toDivisionId: 'd2', reason: 'New challenge' }),
    headers: {},
    requestContext: {
      authorizer: { groups, username: 'wrestler', email: 'w@test.com', principalId: 'sub-1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('createTransferRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayers.findByUserId.mockResolvedValue({ playerId: 'p1', divisionId: 'd1' });
    mockDivisions.findById.mockResolvedValue({ divisionId: 'd2' });
    mockTransfers.listPendingByPlayer.mockResolvedValue([]);
    mockTransfers.create.mockResolvedValue({ requestId: 'r1' });
  });

  it('returns 403 and creates nothing while transfers are off', async () => {
    mockGetFeatures.mockResolvedValue({ transfers: false });

    const result = await createTransferRequest(event(), ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toBe('Division transfer requests are currently turned off');
    expect(mockTransfers.create).not.toHaveBeenCalled();
  });

  it('creates the request when transfers are on', async () => {
    mockGetFeatures.mockResolvedValue({ transfers: true });

    const result = await createTransferRequest(event(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(mockTransfers.create).toHaveBeenCalledWith({
      playerId: 'p1', fromDivisionId: 'd1', toDivisionId: 'd2', reason: 'New challenge',
    });
  });

  it('refuses the wrong role before reading the flag', async () => {
    const result = await createTransferRequest(event('Fantasy'), ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(mockGetFeatures).not.toHaveBeenCalled();
  });
});
