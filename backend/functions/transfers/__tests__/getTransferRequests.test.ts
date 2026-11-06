import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockTransfersList, mockListByPlayer, mockPlayersList, mockFindByUserId, mockDivisionsList, mockDivisionFindById } = vi.hoisted(() => ({
  mockTransfersList: vi.fn(),
  mockListByPlayer: vi.fn(),
  mockPlayersList: vi.fn(),
  mockFindByUserId: vi.fn(),
  mockDivisionsList: vi.fn(),
  mockDivisionFindById: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: {
      transfers: { list: mockTransfersList, listByPlayer: mockListByPlayer },
      players: { list: mockPlayersList, findByUserId: mockFindByUserId },
    },
    leagueOps: { divisions: { list: mockDivisionsList, findById: mockDivisionFindById } },
  }),
}));

import { handler as getTransferRequests } from '../getTransferRequests';
import { handler as getMyTransferRequests } from '../getMyTransferRequests';

const ctx = {} as Context;
const cb: Callback = () => {};
const reviewerSub = '44487408-d061-7064-ee50-c331bb108486';
const goneDivision = '02fc283a-59e6-4779-addd-c290e98dfa6d';

function makeEvent(groups: string): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: { groups, username: 'tester', email: 't@t', principalId: 'caller-sub' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const request = {
  requestId: 'r1',
  playerId: 'p1',
  fromDivisionId: goneDivision,
  toDivisionId: 'd2',
  reason: 'Move me',
  status: 'approved',
  reviewedBy: reviewerSub,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTransfersList.mockResolvedValue([request]);
  mockListByPlayer.mockResolvedValue([request]);
  mockFindByUserId.mockResolvedValue({ playerId: 'p1' });
  mockPlayersList.mockResolvedValue([
    { playerId: 'p1', name: 'Mover' },
    { playerId: 'p9', name: 'The GM', userId: reviewerSub },
  ]);
  mockDivisionsList.mockResolvedValue([{ divisionId: 'd2', name: 'Raw' }]);
  mockDivisionFindById.mockImplementation(async (id: string) => (id === 'd2' ? { divisionId: 'd2', name: 'Raw' } : null));
});

describe('getTransferRequests', () => {
  it('returns the reviewer and division names, not ids', async () => {
    const result = await getTransferRequests(makeEvent('Moderator'), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)[0]).toMatchObject({
      playerName: 'Mover',
      fromDivisionName: 'Unknown Division',
      toDivisionName: 'Raw',
      reviewedBy: 'The GM',
    });
  });

  it('falls back to a label when the reviewer has no linked player', async () => {
    mockPlayersList.mockResolvedValue([{ playerId: 'p1', name: 'Mover' }]);

    const result = await getTransferRequests(makeEvent('Admin'), ctx, cb);

    expect(result!.body).not.toContain(reviewerSub);
    expect(JSON.parse(result!.body)[0].reviewedBy).toBe('League Staff');
  });

  it('leaves a pending request without a reviewer', async () => {
    mockTransfersList.mockResolvedValue([{ ...request, status: 'pending', reviewedBy: undefined }]);

    const result = await getTransferRequests(makeEvent('Admin'), ctx, cb);

    expect(JSON.parse(result!.body)[0]).not.toHaveProperty('reviewedBy');
  });
});

describe('getMyTransferRequests', () => {
  it('never shows a deleted division as its id', async () => {
    const result = await getMyTransferRequests(makeEvent('Wrestler'), ctx, cb);

    expect(JSON.parse(result!.body)[0]).toMatchObject({
      fromDivisionName: 'Unknown Division',
      toDivisionName: 'Raw',
    });
  });
});
