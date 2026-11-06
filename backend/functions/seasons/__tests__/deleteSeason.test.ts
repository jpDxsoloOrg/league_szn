import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const mockSeasonsFindById = vi.fn();
const mockSeasonsDelete = vi.fn();
const mockStandingsDeleteAllForSeason = vi.fn();
const mockAwardsDeleteAllForSeason = vi.fn();

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    season: {
      seasons: {
      findById: mockSeasonsFindById,
      delete: mockSeasonsDelete,
    },
      awards: {
      deleteAllForSeason: mockAwardsDeleteAllForSeason,
    },
      standings: {
      deleteAllForSeason: mockStandingsDeleteAllForSeason,
    },
    },
  }),
}));

import { handler as deleteSeason } from '../deleteSeason';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'DELETE',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: { authorizer: {} } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

// ─── deleteSeason ────────────────────────────────────────────────────

describe('deleteSeason', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes season and returns 204', async () => {
    mockSeasonsFindById.mockResolvedValue({ seasonId: 's1', name: 'Season 1' });
    mockSeasonsDelete.mockResolvedValue(undefined);
    mockStandingsDeleteAllForSeason.mockResolvedValue(undefined);
    mockAwardsDeleteAllForSeason.mockResolvedValue(undefined);

    const event = makeEvent({ pathParameters: { seasonId: 's1' } });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(mockSeasonsDelete).toHaveBeenCalledWith('s1');
    expect(mockAwardsDeleteAllForSeason).toHaveBeenCalledWith('s1');
    expect(mockStandingsDeleteAllForSeason).toHaveBeenCalledWith('s1');
  });

  it('cascades delete to all season standings and awards', async () => {
    mockSeasonsFindById.mockResolvedValue({ seasonId: 's1' });
    mockSeasonsDelete.mockResolvedValue(undefined);
    mockStandingsDeleteAllForSeason.mockResolvedValue(undefined);
    mockAwardsDeleteAllForSeason.mockResolvedValue(undefined);

    const event = makeEvent({ pathParameters: { seasonId: 's1' } });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(mockStandingsDeleteAllForSeason).toHaveBeenCalledWith('s1');
    expect(mockAwardsDeleteAllForSeason).toHaveBeenCalledWith('s1');
  });

  it('refuses an active season without deleting anything', async () => {
    mockSeasonsFindById.mockResolvedValue({ seasonId: 's1', status: 'active' });

    const result = await deleteSeason(makeEvent({ pathParameters: { seasonId: 's1' } }), ctx, cb);

    expect(result!.statusCode).toBe(409);
    expect(mockStandingsDeleteAllForSeason).not.toHaveBeenCalled();
    expect(mockAwardsDeleteAllForSeason).not.toHaveBeenCalled();
    expect(mockSeasonsDelete).not.toHaveBeenCalled();
  });

  it('keeps the season when deleting a child fails, so the delete can be retried', async () => {
    mockSeasonsFindById.mockResolvedValue({ seasonId: 's1', status: 'completed' });
    mockStandingsDeleteAllForSeason.mockResolvedValue(undefined);
    mockAwardsDeleteAllForSeason.mockRejectedValue(new Error('boom'));

    const result = await deleteSeason(makeEvent({ pathParameters: { seasonId: 's1' } }), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(mockSeasonsDelete).not.toHaveBeenCalled();
  });

  it('returns 400 when seasonId is missing from path', async () => {
    const event = makeEvent({ pathParameters: null });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Season ID is required');
  });

  it('returns 404 when season does not exist', async () => {
    mockSeasonsFindById.mockResolvedValue(null);

    const event = makeEvent({ pathParameters: { seasonId: 'missing' } });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Season not found');
    expect(mockSeasonsDelete).not.toHaveBeenCalled();
  });

  it('handles empty standings list gracefully', async () => {
    mockSeasonsFindById.mockResolvedValue({ seasonId: 's1' });
    mockSeasonsDelete.mockResolvedValue(undefined);
    mockStandingsDeleteAllForSeason.mockResolvedValue(undefined);
    mockAwardsDeleteAllForSeason.mockResolvedValue(undefined);

    const event = makeEvent({ pathParameters: { seasonId: 's1' } });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(204);
    expect(mockStandingsDeleteAllForSeason).toHaveBeenCalledWith('s1');
  });

  it('returns 500 when repository throws', async () => {
    mockSeasonsFindById.mockRejectedValue(new Error('DB failure'));

    const event = makeEvent({ pathParameters: { seasonId: 's1' } });

    const result = await deleteSeason(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to delete season');
  });
});
