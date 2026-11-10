import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const { mockFindByIdWithDate, mockUpdate, mockTxUpdateMatch, mockRunInTransaction } = vi.hoisted(() => {
  const txUpdateMatch = vi.fn();
  return {
    mockFindByIdWithDate: vi.fn(),
    mockUpdate: vi.fn(),
    mockTxUpdateMatch: txUpdateMatch,
    mockRunInTransaction: vi.fn(async (work: (tx: { updateMatch: typeof txUpdateMatch }) => Promise<void>) => {
      await work({ updateMatch: txUpdateMatch });
    }),
  };
});

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    competition: {
      matches: { findByIdWithDate: mockFindByIdWithDate, update: mockUpdate },
    },
    runInTransaction: mockRunInTransaction,
  }),
}));

import { handler as updateMatch, buildCloseSignupsPatch } from '../updateMatch';
import type { Match } from '../../../lib/repositories/types';
import { ConcurrencyError } from '../../../lib/repositories/errors';

const ctx = {} as Context;
const cb: Callback = () => {};

function ev(body: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'PUT',
    isBase64Encoded: false,
    path: '/',
    pathParameters: { matchId: 'm1' },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '',
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
  };
}

function openMatch(overrides: Partial<Match> = {}): Match {
  return {
    matchId: 'm1',
    date: '2026-11-09',
    matchFormat: 'Triple Threat',
    status: 'open-signups',
    updatedAt: '2026-11-01T10:00:00.000Z',
    participants: ['p1', 'p3'],
    slots: [
      { slotId: 's1', position: 1, playerId: 'p1', claimedAt: 'x' },
      { slotId: 's2', position: 2 },
      { slotId: 's3', position: 3, playerId: 'p3', lockedByAdmin: true },
    ],
    slotsRequired: 3,
    ...overrides,
  } as Match;
}

async function send(body: Record<string, unknown>) {
  const result = await updateMatch(ev(body), ctx, cb);
  if (!result) throw new Error('no result');
  return { statusCode: result.statusCode, body: JSON.parse(result.body) as Record<string, unknown> };
}

describe('updateMatch closeSignups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunInTransaction.mockImplementation(async (work) => {
      await work({ updateMatch: mockTxUpdateMatch });
    });
  });

  it('drops the empty spots, renumbers the rest and schedules the match', async () => {
    mockFindByIdWithDate.mockResolvedValue(openMatch());

    const result = await send({ closeSignups: true });

    expect(result.statusCode).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockTxUpdateMatch).toHaveBeenCalledWith('m1', '2026-11-09', {
      slots: [
        { slotId: 's1', position: 1, playerId: 'p1', claimedAt: 'x' },
        { slotId: 's3', position: 2, playerId: 'p3', lockedByAdmin: true },
      ],
      slotsRequired: 2,
      participants: ['p1', 'p3'],
      status: 'scheduled',
    }, { kind: 'unchangedSince', updatedAt: '2026-11-01T10:00:00.000Z' });
    expect(result.body.status).toBe('scheduled');
  });

  it('returns 409 when a sign-up lands between the read and the close', async () => {
    mockFindByIdWithDate.mockResolvedValue(openMatch());
    mockRunInTransaction.mockRejectedValueOnce(new ConcurrencyError('Match', 'm1'));

    const result = await send({ closeSignups: true });

    expect(result.statusCode).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses when fewer than two wrestlers have signed up', async () => {
    mockFindByIdWithDate.mockResolvedValue(openMatch({
      participants: ['p1'],
      slots: [
        { slotId: 's1', position: 1, playerId: 'p1' },
        { slotId: 's2', position: 2 },
      ],
    }));

    const result = await send({ closeSignups: true });

    expect(result.statusCode).toBe(400);
    expect(mockTxUpdateMatch).not.toHaveBeenCalled();
  });

  it('refuses a match whose sign-ups are not open', async () => {
    mockFindByIdWithDate.mockResolvedValue(openMatch({ status: 'scheduled' }));

    const result = await send({ closeSignups: true });

    expect(result.statusCode).toBe(400);
    expect(mockTxUpdateMatch).not.toHaveBeenCalled();
  });

  it('refuses closeSignups mixed with other edits', async () => {
    mockFindByIdWithDate.mockResolvedValue(openMatch());

    const result = await send({ closeSignups: true, matchFormat: 'Singles' });

    expect(result.statusCode).toBe(400);
    expect(mockTxUpdateMatch).not.toHaveBeenCalled();
  });

  it('still refuses ordinary edits on an open-signups match', async () => {
    mockFindByIdWithDate.mockResolvedValue(openMatch());

    const result = await send({ matchFormat: 'Singles' });

    expect(result.statusCode).toBe(400);
  });

  it('builds no patch for a completed match', () => {
    expect(buildCloseSignupsPatch(openMatch({ status: 'completed' }))).toHaveProperty('error');
  });
});
