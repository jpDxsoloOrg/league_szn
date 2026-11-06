import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockRequestsList, mockPlayersList } = vi.hoisted(() => ({
  mockRequestsList: vi.fn(),
  mockPlayersList: vi.fn(),
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    content: { storylineRequests: { list: mockRequestsList } },
    roster: { players: { list: mockPlayersList } },
  }),
}));

import { handler as getStorylineRequests } from '../getStorylineRequests';

const ctx = {} as Context;
const cb: Callback = () => {};
const reviewerSub = '44487408-d061-7064-ee50-c331bb108486';

const event = {
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
    authorizer: { groups: 'Moderator', username: 'mod', email: 'm@m', principalId: 'mod-sub' },
  },
} as unknown as APIGatewayProxyEvent;

describe('getStorylineRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestsList.mockResolvedValue([
      {
        requestId: 'r1',
        requesterId: 'p1',
        targetPlayerIds: [],
        requestType: 'storyline',
        description: 'Idea',
        status: 'acknowledged',
        reviewedBy: reviewerSub,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('returns the reviewer name, not their id', async () => {
    mockPlayersList.mockResolvedValue([
      { playerId: 'p1', name: 'Writer' },
      { playerId: 'p9', name: 'The GM', userId: reviewerSub },
    ]);

    const result = await getStorylineRequests(event, ctx, cb);

    expect(JSON.parse(result!.body)[0].reviewedBy).toBe('The GM');
  });

  it('falls back to a label when the reviewer has no linked player', async () => {
    mockPlayersList.mockResolvedValue([{ playerId: 'p1', name: 'Writer' }]);

    const result = await getStorylineRequests(event, ctx, cb);

    expect(result!.body).not.toContain(reviewerSub);
    expect(JSON.parse(result!.body)[0].reviewedBy).toBe('League Staff');
  });
});
