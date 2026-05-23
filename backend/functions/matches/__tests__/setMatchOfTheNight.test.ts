import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ---- Repository Mocks -----------------------------------------------------

const mockMatchesRepo = {
  findByIdWithDate: vi.fn(),
};

const mockRunInTransaction = vi.fn();

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      matches: mockMatchesRepo,
    },
    runInTransaction: mockRunInTransaction,
  }),
}));

import { handler as setMatchOfTheNight } from '../setMatchOfTheNight';

// ---- Helpers --------------------------------------------------------------

const ctx = {} as Context;
const cb: Callback = () => {};

const completedMatch = {
  matchId: 'm1',
  date: '2024-06-01',
  status: 'completed',
  participants: ['p1', 'p2'],
  winners: ['p1'],
  losers: ['p2'],
};

function ev(
  overrides: Partial<APIGatewayProxyEvent> = {},
  groups: string = 'Admin',
): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'PUT',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {
      authorizer: { groups, username: 'tester', email: 't@x', principalId: 'sub-1' },
    } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

function stubTx() {
  mockRunInTransaction.mockImplementation(
    async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = { updateMatch: vi.fn() };
      await fn(tx);
      return tx;
    },
  );
}

describe('setMatchOfTheNight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Make sure live role checks run (not offline-bypassed)
    delete process.env.IS_OFFLINE;
  });

  it('admin can mark a completed match as MOTN (200) and tx receives true', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(completedMatch);
    stubTx();

    const r = await setMatchOfTheNight(
      ev({
        pathParameters: { matchId: 'm1' },
        body: JSON.stringify({ matchOfTheNight: true }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(200);
    expect(mockRunInTransaction).toHaveBeenCalledTimes(1);

    // Inspect tx mutations
    const txFn = mockRunInTransaction.mock.calls[0][0];
    const tx = { updateMatch: vi.fn() };
    await txFn(tx);
    expect(tx.updateMatch).toHaveBeenCalledWith('m1', '2024-06-01', { matchOfTheNight: true });

    const body = JSON.parse(r!.body);
    expect(body.matchOfTheNight).toBe(true);
  });

  it('admin can toggle MOTN off (200) and tx receives false', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue({
      ...completedMatch,
      matchOfTheNight: true,
    });
    stubTx();

    const r = await setMatchOfTheNight(
      ev({
        pathParameters: { matchId: 'm1' },
        body: JSON.stringify({ matchOfTheNight: false }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(200);

    const txFn = mockRunInTransaction.mock.calls[0][0];
    const tx = { updateMatch: vi.fn() };
    await txFn(tx);
    expect(tx.updateMatch).toHaveBeenCalledWith('m1', '2024-06-01', { matchOfTheNight: false });

    const body = JSON.parse(r!.body);
    expect(body.matchOfTheNight).toBe(false);
  });

  it('returns 403 when caller is a Wrestler', async () => {
    const r = await setMatchOfTheNight(
      ev(
        {
          pathParameters: { matchId: 'm1' },
          body: JSON.stringify({ matchOfTheNight: true }),
        },
        'Wrestler',
      ),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(403);
    expect(mockMatchesRepo.findByIdWithDate).not.toHaveBeenCalled();
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('returns 404 when match does not exist', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(null);

    const r = await setMatchOfTheNight(
      ev({
        pathParameters: { matchId: 'missing' },
        body: JSON.stringify({ matchOfTheNight: true }),
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

    const r = await setMatchOfTheNight(
      ev({
        pathParameters: { matchId: 'm1' },
        body: JSON.stringify({ matchOfTheNight: true }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(409);
    expect(JSON.parse(r!.body).message).toContain('not completed');
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('returns 400 when matchOfTheNight is not a boolean', async () => {
    const r = await setMatchOfTheNight(
      ev({
        pathParameters: { matchId: 'm1' },
        body: JSON.stringify({ matchOfTheNight: 'yes' }),
      }),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(400);
    expect(JSON.parse(r!.body).message).toContain('boolean');
    expect(mockMatchesRepo.findByIdWithDate).not.toHaveBeenCalled();
    expect(mockRunInTransaction).not.toHaveBeenCalled();
  });

  it('moderator can mark MOTN (200)', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(completedMatch);
    stubTx();

    const r = await setMatchOfTheNight(
      ev(
        {
          pathParameters: { matchId: 'm1' },
          body: JSON.stringify({ matchOfTheNight: true }),
        },
        'Moderator',
      ),
      ctx,
      cb,
    );

    expect(r!.statusCode).toBe(200);
  });
});
