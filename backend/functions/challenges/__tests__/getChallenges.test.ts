import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGet, mockScanAll, mockQueryAll } = vi.hoisted(() => ({
  mockGet: vi.fn(), mockScanAll: vi.fn(), mockQueryAll: vi.fn(),
}));

vi.mock('../../../lib/dynamodb', () => ({
  dynamoDb: { get: mockGet, scanAll: mockScanAll, queryAll: mockQueryAll },
  TableNames: { CHALLENGES: 'Challenges', PLAYERS: 'Players', TAG_TEAMS: 'TagTeams' },
}));

import { handler as getChallenges } from '../getChallenges';
import { handler as getChallenge } from '../getChallenge';

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'GET',
    isBase64Encoded: false, path: '/', pathParameters: null,
    queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: {} } as any, ...overrides,
  };
}

const p1 = { playerId: 'p1', name: 'John Cena', currentWrestler: 'Cena', imageUrl: 'img1.jpg' };
const p2 = { playerId: 'p2', name: 'The Rock', currentWrestler: 'Rock', imageUrl: 'img2.jpg' };

function mockPlayerLookup() {
  mockGet.mockImplementation(({ Key }: any) => {
    if (Key.playerId === 'p1') return Promise.resolve({ Item: p1 });
    if (Key.playerId === 'p2') return Promise.resolve({ Item: p2 });
    return Promise.resolve({ Item: undefined });
  });
}

const mockChallenge1 = {
  challengeId: 'ch1', challengerId: 'p1', challengedId: 'p2',
  matchType: 'Singles', status: 'pending', createdAt: '2025-01-15T10:00:00.000Z',
};
const mockChallenge2 = {
  challengeId: 'ch2', challengerId: 'p2', challengedId: 'p1',
  matchType: 'Cage', status: 'accepted', createdAt: '2025-01-16T10:00:00.000Z',
};

// ─── getChallenges ──────────────────────────────────────────────────

describe('getChallenges', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all challenges via scanAll when no filters provided', async () => {
    mockScanAll.mockResolvedValue([mockChallenge1, mockChallenge2]);
    mockPlayerLookup();

    const result = await getChallenges(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    expect(mockScanAll).toHaveBeenCalledOnce();
  });

  it('filters challenges by status via StatusIndex when status param provided', async () => {
    mockQueryAll.mockResolvedValue([mockChallenge1]);
    mockPlayerLookup();

    const event = makeEvent({ queryStringParameters: { status: 'pending' } });
    const result = await getChallenges(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.objectContaining({ IndexName: 'StatusIndex' }),
    );
  });

  it('filters challenges by playerId using both ChallengerIndex and ChallengedIndex', async () => {
    mockQueryAll.mockImplementation(({ IndexName }: any) => {
      if (IndexName === 'ChallengerIndex') return Promise.resolve([mockChallenge1]);
      if (IndexName === 'ChallengedIndex') return Promise.resolve([mockChallenge2]);
      // Player1Index / Player2Index for tag team lookup return empty (no tag team)
      return Promise.resolve([]);
    });
    mockPlayerLookup();

    const event = makeEvent({ queryStringParameters: { playerId: 'p1' } });
    const result = await getChallenges(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(2);
    // 2 challenge queries + 2 tag team lookups (Player1Index, Player2Index)
    expect(mockQueryAll).toHaveBeenCalledTimes(4);
  });

  it('deduplicates challenges when same challenge appears in both indexes', async () => {
    mockQueryAll.mockImplementation(({ IndexName }: any) => {
      if (IndexName === 'ChallengerIndex') return Promise.resolve([mockChallenge1]);
      if (IndexName === 'ChallengedIndex') return Promise.resolve([mockChallenge1]);
      return Promise.resolve([]);
    });
    mockPlayerLookup();

    const event = makeEvent({ queryStringParameters: { playerId: 'p1' } });
    const result = await getChallenges(event, ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body).toHaveLength(1);
  });

  it('enriches challenges with player names and wrestler info', async () => {
    mockScanAll.mockResolvedValue([mockChallenge1]);
    mockPlayerLookup();

    const result = await getChallenges(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body[0].challenger).toEqual({
      playerName: 'John Cena',
      wrestlerName: 'Cena',
      imageUrl: 'img1.jpg',
    });
    expect(body[0].challenged).toEqual({
      playerName: 'The Rock',
      wrestlerName: 'Rock',
      imageUrl: 'img2.jpg',
    });
  });

  it('uses Unknown fallback when player is not found during enrichment', async () => {
    mockScanAll.mockResolvedValue([mockChallenge1]);
    mockGet.mockResolvedValue({ Item: undefined });

    const result = await getChallenges(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body[0].challenger).toEqual({ playerName: 'Unknown', wrestlerName: 'Unknown' });
    expect(body[0].challenged).toEqual({ playerName: 'Unknown', wrestlerName: 'Unknown' });
  });

  it('sorts results by createdAt descending', async () => {
    mockScanAll.mockResolvedValue([mockChallenge1, mockChallenge2]);
    mockPlayerLookup();

    const result = await getChallenges(makeEvent(), ctx, cb);

    const body = JSON.parse(result!.body);
    // ch2 (Jan 16) should come before ch1 (Jan 15)
    expect(body[0].challengeId).toBe('ch2');
    expect(body[1].challengeId).toBe('ch1');
  });

  it('returns empty array when no challenges exist', async () => {
    mockScanAll.mockResolvedValue([]);

    const result = await getChallenges(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual([]);
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockScanAll.mockRejectedValue(new Error('DynamoDB failure'));

    const result = await getChallenges(makeEvent(), ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch challenges');
  });

  it('playerId filter takes priority over status filter', async () => {
    mockQueryAll.mockResolvedValue([]);
    mockGet.mockResolvedValue({ Item: undefined });

    const event = makeEvent({
      queryStringParameters: { playerId: 'p1', status: 'pending' },
    });
    const result = await getChallenges(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    // Should use ChallengerIndex/ChallengedIndex, not StatusIndex
    expect(mockQueryAll).toHaveBeenCalledWith(
      expect.objectContaining({ IndexName: 'ChallengerIndex' }),
    );
    expect(mockScanAll).not.toHaveBeenCalled();
  });
});

// ─── getChallenge ───────────────────────────────────────────────────

describe('getChallenge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a single challenge enriched with player info', async () => {
    mockGet.mockImplementation(({ TableName, Key }: any) => {
      if (TableName === 'Challenges') return Promise.resolve({ Item: mockChallenge1 });
      if (Key.playerId === 'p1') return Promise.resolve({ Item: p1 });
      if (Key.playerId === 'p2') return Promise.resolve({ Item: p2 });
      return Promise.resolve({ Item: undefined });
    });

    const event = makeEvent({ pathParameters: { challengeId: 'ch1' } });
    const result = await getChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.challengeId).toBe('ch1');
    expect(body.challenger.playerName).toBe('John Cena');
    expect(body.challenged.playerName).toBe('The Rock');
  });

  it('returns 400 when challengeId is missing from path', async () => {
    const event = makeEvent({ pathParameters: null });
    const result = await getChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('challengeId is required');
  });

  it('returns 404 when challenge does not exist', async () => {
    mockGet.mockResolvedValue({ Item: undefined });

    const event = makeEvent({ pathParameters: { challengeId: 'nonexistent' } });
    const result = await getChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Challenge not found');
  });

  it('uses Unknown fallback when players are not found during enrichment', async () => {
    mockGet.mockImplementation(({ TableName }: any) => {
      if (TableName === 'Challenges') return Promise.resolve({ Item: mockChallenge1 });
      return Promise.resolve({ Item: undefined });
    });

    const event = makeEvent({ pathParameters: { challengeId: 'ch1' } });
    const result = await getChallenge(event, ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.challenger).toEqual({ playerName: 'Unknown', wrestlerName: 'Unknown' });
    expect(body.challenged).toEqual({ playerName: 'Unknown', wrestlerName: 'Unknown' });
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockGet.mockRejectedValue(new Error('DynamoDB failure'));

    const event = makeEvent({ pathParameters: { challengeId: 'ch1' } });
    const result = await getChallenge(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to fetch challenge');
  });
});
