import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import { ConcurrencyError } from '../../repositories/errors';

// ---- Repository Mocks -----------------------------------------------------

const mockMatchesRepo = {
  findById: vi.fn(),
  findByIdWithDate: vi.fn(),
  listByTournament: vi.fn(),
};

const mockPlayersRepo = {
  findById: vi.fn(async (playerId: string): Promise<{ playerId: string } | null> => ({ playerId })),
};

const mockEventsRepo = { list: vi.fn(), update: vi.fn() };

const mockRunInTransaction = vi.fn();

vi.mock('../../repositories', () => ({
  getRepositories: () => ({
    competition: {
      matches: mockMatchesRepo,
      championships: { findById: vi.fn() },
      tournaments: { findById: vi.fn(), update: vi.fn() },
      contenders: {},
    },
    leagueOps: { events: mockEventsRepo },
    roster: { players: mockPlayersRepo },
    season: { seasons: { findById: vi.fn() } },
    runInTransaction: mockRunInTransaction,
  }),
}));

vi.mock('../../asyncLambda', () => ({ invokeAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../progression/trigger', () => ({ triggerProgressionRecompute: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../economy/matchPay', () => ({ settleMatchPay: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../economy/refundSimBoosts', () => ({ refundSimBoosts: vi.fn().mockResolvedValue(0) }));
vi.mock('../../../functions/matches/updateGroupStats', () => ({
  updateGroupStats: vi.fn().mockResolvedValue(undefined),
}));

import {
  recordMatchResult,
  RecordMatchResultBadRequestError,
  RecordMatchResultConflictError,
  RecordMatchResultNotFoundError,
} from '../recordMatchResult';
import { handler as recordResultHandler } from '../../../functions/matches/recordResult';
import { settleMatchPay } from '../../economy/matchPay';
import { refundSimBoosts } from '../../economy/refundSimBoosts';

// ---- Helpers ---------------------------------------------------------------

const scheduledMatch = {
  matchId: 'm1',
  date: '2024-06-01',
  status: 'scheduled',
  participants: ['p1', 'p2'],
  simBoosts: [{ purchaseKey: 'k1' }],
};

let lastTx: { updateMatch: ReturnType<typeof vi.fn> } | null = null;

function stubSuccess(match: Record<string, unknown> = scheduledMatch): void {
  mockMatchesRepo.findByIdWithDate.mockResolvedValue(match);
  mockRunInTransaction.mockImplementation(async (work: (tx: Record<string, unknown>) => Promise<unknown>) => {
    const tx = {
      updateMatch: vi.fn(),
      incrementPlayerRecord: vi.fn(),
      incrementStanding: vi.fn(),
    };
    lastTx = tx;
    await work(tx);
  });
  mockEventsRepo.list.mockResolvedValue([]);
}

function httpEvent(body: unknown): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body), headers: {}, multiValueHeaders: {}, httpMethod: 'PUT',
    isBase64Encoded: false, path: '/', pathParameters: { matchId: 'm1' },
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '', requestContext: { authorizer: {} } as never,
  };
}

const manual = { source: 'manual' as const };
const simulated = { source: 'sim' as const };

// ---- Typed errors ------------------------------------------------------------

describe('recordMatchResult — typed errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubSuccess();
  });

  it('throws BadRequest when winners or losers are missing', async () => {
    await expect(recordMatchResult({ matchId: 'm1', winners: ['p1'] }, manual))
      .rejects.toBeInstanceOf(RecordMatchResultBadRequestError);
  });

  it('throws NotFound when the match does not exist', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(null);
    await expect(recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, manual))
      .rejects.toBeInstanceOf(RecordMatchResultNotFoundError);
  });

  it('throws Conflict when the match has open signups', async () => {
    stubSuccess({ ...scheduledMatch, status: 'open-signups' });
    await expect(recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, manual))
      .rejects.toBeInstanceOf(RecordMatchResultConflictError);
  });

  it('throws Conflict when a concurrent write beats the transaction', async () => {
    mockRunInTransaction.mockRejectedValue(new ConcurrencyError('match', 'm1'));
    await expect(recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, simulated))
      .rejects.toBeInstanceOf(RecordMatchResultConflictError);
  });

  it('lets unexpected errors through untyped', async () => {
    mockRunInTransaction.mockRejectedValue(new Error('boom'));
    await expect(recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, manual))
      .rejects.toThrow('boom');
  });
});

// ---- Handler mapping -------------------------------------------------------

describe('recordResult handler — maps service errors', () => {
  const ctx = {} as Context;
  const cb: Callback = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
    stubSuccess();
  });

  it('maps BadRequest to 400', async () => {
    const response = await recordResultHandler(httpEvent({ winners: ['p1'] }), ctx, cb);
    expect(response!.statusCode).toBe(400);
  });

  it('maps NotFound to 404', async () => {
    mockMatchesRepo.findByIdWithDate.mockResolvedValue(null);
    const response = await recordResultHandler(httpEvent({ winners: ['p1'], losers: ['p2'] }), ctx, cb);
    expect(response!.statusCode).toBe(404);
  });

  it('maps Conflict to 409', async () => {
    mockRunInTransaction.mockRejectedValue(new ConcurrencyError('match', 'm1'));
    const response = await recordResultHandler(httpEvent({ winners: ['p1'], losers: ['p2'] }), ctx, cb);
    expect(response!.statusCode).toBe(409);
  });

  it('maps an unexpected error to 500', async () => {
    mockRunInTransaction.mockRejectedValue(new Error('boom'));
    const response = await recordResultHandler(httpEvent({ winners: ['p1'], losers: ['p2'] }), ctx, cb);
    expect(response!.statusCode).toBe(500);
  });

  it('records the HTTP result as manual, so boosts are refunded', async () => {
    const response = await recordResultHandler(httpEvent({ winners: ['p1'], losers: ['p2'] }), ctx, cb);
    expect(response!.statusCode).toBe(200);
    expect(refundSimBoosts).toHaveBeenCalledWith(expect.objectContaining({ matchId: 'm1' }), 'manualResult');
  });
});

// ---- Source and extra fields -----------------------------------------------

describe('recordMatchResult — source and extraMatchFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubSuccess();
  });

  it('pays the match for both sources but refunds boosts only for manual', async () => {
    await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, simulated);
    expect(settleMatchPay).toHaveBeenCalledWith('m1');
    expect(refundSimBoosts).not.toHaveBeenCalled();

    vi.clearAllMocks();
    stubSuccess();
    await recordMatchResult({ matchId: 'm1', winners: ['p1'], losers: ['p2'] }, manual);
    expect(settleMatchPay).toHaveBeenCalledWith('m1');
    expect(refundSimBoosts).toHaveBeenCalledTimes(1);
  });

  it('stamps extra fields in the result transaction without overriding the result', async () => {
    const extraMatchFields = { resultSource: 'simulation', simulation: { seed: 7 }, status: 'scheduled' };
    const { match } = await recordMatchResult(
      { matchId: 'm1', winners: ['p1'], losers: ['p2'], extraMatchFields },
      simulated,
    );

    const patch = lastTx!.updateMatch.mock.calls[0][2] as Record<string, unknown>;
    expect(patch).toMatchObject({
      resultSource: 'simulation',
      simulation: { seed: 7 },
      status: 'completed',
      winners: ['p1'],
      losers: ['p2'],
    });
    expect(lastTx!.updateMatch.mock.calls[0][3]).toEqual({ kind: 'notCompleted' });
    expect(match).toMatchObject({ resultSource: 'simulation', status: 'completed' });
  });
});
