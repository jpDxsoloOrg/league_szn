import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import { computeRivalryHeat } from '../../../lib/policies/rivalryHeat';
import { RatingAlreadyExistsError } from '../../../lib/repositories/matchRatings';

// ---- Repository Mocks -----------------------------------------------------

const mockMatchesRepo = {
  findByIdWithDate: vi.fn(),
  findByRivalryId: vi.fn(),
};

const mockMatchRatingsRepo = {
  getByMatch: vi.fn(),
};

const mockRunInTransaction = vi.fn();

vi.mock('../../../lib/repositories', async () => {
  const actual = await vi.importActual<
    typeof import('../../../lib/repositories')
  >('../../../lib/repositories');
  return {
    ...actual,
    getRepositories: () => ({
      competition: { matches: mockMatchesRepo },
      matchRatings: mockMatchRatingsRepo,
      runInTransaction: mockRunInTransaction,
    }),
  };
});

import { handler as submitRating } from '../submitRating';

// ---- Helpers --------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

const completedMatch = {
  matchId: 'm1',
  date: '2024-06-01',
  status: 'completed',
  participants: ['p1', 'p2'],
};

interface TxRecord {
  createMatchRating: ReturnType<typeof vi.fn>;
  updateMatch: ReturnType<typeof vi.fn>;
  updateRivalry: ReturnType<typeof vi.fn>;
}

function stubTx(): { calls: TxRecord } {
  const record: TxRecord = {
    createMatchRating: vi.fn(),
    updateMatch: vi.fn(),
    updateRivalry: vi.fn(),
  };
  mockRunInTransaction.mockImplementation(
    async (fn: (tx: TxRecord) => Promise<unknown>) => {
      await fn(record);
      return record;
    },
  );
  return { calls: record };
}

function ev(
  overrides: Partial<APIGatewayProxyEvent> = {},
  options: { authed?: boolean; groups?: string } = {},
): APIGatewayProxyEvent {
  const { authed = true, groups = 'Wrestler' } = options;
  const authorizer = authed
    ? { groups, username: 'tester', email: 't@x', principalId: 'user-42' }
    : { groups: '', username: '', email: '', principalId: '' };
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer,
    } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

describe('submitRating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.IS_OFFLINE;
  });

  it('happy path: no rivalry — averages two existing 4-star ratings plus new 5', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(completedMatch);
    mockMatchRatingsRepo.getByMatch.mockResolvedValue([
      { matchId: 'm1', userId: 'u1', rating: 4, createdAt: 'x' },
      { matchId: 'm1', userId: 'u2', rating: 4, createdAt: 'x' },
    ]);
    const { calls } = stubTx();

    const r = await submitRating(
      ev({
        pathParameters: { matchId: 'm1' },
        body: JSON.stringify({ rating: 5 }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(201);
    const body = JSON.parse(r!.body);
    expect(body.matchAggregate.ratingsCount).toBe(3);
    // (4 + 4 + 5) / 3 = 4.333...
    expect(body.matchAggregate.ratingAverage).toBeCloseTo(13 / 3, 5);
    expect(body.matchAggregate.starRating).toBe(4.5);
    expect(body.rivalry).toBeNull();

    // Inspect tx mutations
    expect(calls.createMatchRating).toHaveBeenCalledWith({
      matchId: 'm1',
      userId: 'user-42',
      rating: 5,
    });
    expect(calls.updateMatch).toHaveBeenCalledTimes(1);
    const [matchId, date, patch] = calls.updateMatch.mock.calls[0];
    expect(matchId).toBe('m1');
    expect(date).toBe('2024-06-01');
    expect(patch.ratingsCount).toBe(3);
    expect(patch.starRating).toBe(4.5);
    expect(patch.ratingAverage).toBeCloseTo(13 / 3, 5);
    expect(calls.updateRivalry).not.toHaveBeenCalled();
  });

  it('happy path: with rivalry — recomputes heat using sibling matches', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue({
      ...completedMatch,
      rivalryId: 'riv-1',
    });
    mockMatchRatingsRepo.getByMatch.mockResolvedValue([]);
    // The current match (m1) is among the siblings; one other already-
    // rated match (m2) sits in the same rivalry.
    mockMatchesRepo.findByRivalryId.mockResolvedValue([
      { matchId: 'm1', ratingAverage: 0, ratingsCount: 0 },
      { matchId: 'm2', ratingAverage: 3, ratingsCount: 1 },
    ]);
    const { calls } = stubTx();

    const r = await submitRating(
      ev({
        pathParameters: { matchId: 'm1' },
        body: JSON.stringify({ rating: 5 }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(201);
    const body = JSON.parse(r!.body);

    // Compute the expected heat from the same policy to keep this test
    // resilient to threshold tuning.
    const expectedHeat = computeRivalryHeat({
      matches: [
        { ratingAverage: 5, ratingsCount: 1 },
        { ratingAverage: 3, ratingsCount: 1 },
      ],
    });

    expect(body.rivalry).toEqual({
      rivalryId: 'riv-1',
      heatScore: expectedHeat.heatScore,
      heat: expectedHeat.tier,
    });

    expect(calls.updateRivalry).toHaveBeenCalledWith('riv-1', {
      heatScore: expectedHeat.heatScore,
      heat: expectedHeat.tier,
    });
  });

  it('returns 401 when caller is unauthenticated (no sub)', async () => {
    const r = await submitRating(
      ev(
        {
          pathParameters: { matchId: 'm1' },
          body: JSON.stringify({ rating: 5 }),
        },
        { authed: false },
      ),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(401);
    expect(mockMatchesRepo.findByIdWithDate).not.toHaveBeenCalled();
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('returns 404 when match does not exist', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(null);

    const r = await submitRating(
      ev({
        pathParameters: { matchId: 'missing' },
        body: JSON.stringify({ rating: 4 }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(404);
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('returns 409 when match is not yet completed', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue({
      ...completedMatch,
      status: 'scheduled',
    });

    const r = await submitRating(
      ev({
        pathParameters: { matchId: 'm1' },
        body: JSON.stringify({ rating: 4 }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(409);
    expect(JSON.parse(r!.body).message).toContain('not completed');
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('returns 409 when the user already rated this match', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(completedMatch);
    mockMatchRatingsRepo.getByMatch.mockResolvedValue([]);
    mockRunInTransaction.mockImplementation(async () => {
      throw new RatingAlreadyExistsError('m1', 'user-42');
    });

    const r = await submitRating(
      ev({
        pathParameters: { matchId: 'm1' },
        body: JSON.stringify({ rating: 4 }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(409);
    expect(JSON.parse(r!.body).message).toContain('already rated');
  });

  it('returns 400 when rating is below 0.5', async () => {
    const r = await submitRating(
      ev({
        pathParameters: { matchId: 'm1' },
        body: JSON.stringify({ rating: 0 }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(400);
    expect(mockMatchesRepo.findByIdWithDate).not.toHaveBeenCalled();
  });

  it('returns 400 when rating is above 5', async () => {
    const r = await submitRating(
      ev({
        pathParameters: { matchId: 'm1' },
        body: JSON.stringify({ rating: 5.5 }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(400);
    expect(mockMatchesRepo.findByIdWithDate).not.toHaveBeenCalled();
  });

  it('returns 400 when rating is not a half-star step (e.g. 0.75)', async () => {
    const r = await submitRating(
      ev({
        pathParameters: { matchId: 'm1' },
        body: JSON.stringify({ rating: 0.75 }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(400);
    expect(mockMatchesRepo.findByIdWithDate).not.toHaveBeenCalled();
  });

  it('returns 400 when matchId path param is missing', async () => {
    const r = await submitRating(
      ev({
        pathParameters: null,
        body: JSON.stringify({ rating: 4 }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(400);
  });
});
