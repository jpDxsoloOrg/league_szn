import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fantasyApi, challengesApi, promosApi, imagesApi } from '../api';

const API_BASE = 'http://localhost:3001/dev';
type FetchMock = ReturnType<typeof vi.fn>;

function mockRes(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300, status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

const fetchMock = () => global.fetch as FetchMock;
const callUrl = (i = 0) => fetchMock().mock.calls[i][0] as string;
const callOpts = (i = 0) => fetchMock().mock.calls[i][1] as RequestInit;
const callBody = (i = 0) => JSON.parse(callOpts(i).body as string);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem('accessToken', 'test-token-123');
  global.fetch = vi.fn();
});
afterEach(() => { sessionStorage.clear(); });

// ---------------------------------------------------------------------------
// fantasyApi (12 functions)
// ---------------------------------------------------------------------------
describe('fantasyApi', () => {
  it('getConfig calls GET /fantasy/config', async () => {
    fetchMock().mockResolvedValue(mockRes({ budgetPerEvent: 100 }));
    await fantasyApi.getConfig();
    expect(callUrl()).toBe(`${API_BASE}/fantasy/config`);
  });

  it('updateConfig sends PUT to /admin/fantasy/config', async () => {
    fetchMock().mockResolvedValue(mockRes({ budgetPerEvent: 200 }));
    // @ts-expect-error partial input for test
    await fantasyApi.updateConfig({ budgetPerEvent: 200 });
    expect(callUrl()).toBe(`${API_BASE}/admin/fantasy/config`);
    expect(callOpts().method).toBe('PUT');
    expect(callBody()).toEqual({ budgetPerEvent: 200 });
  });

  it('getWrestlerCosts calls GET /fantasy/wrestlers/costs', async () => {
    fetchMock().mockResolvedValue(mockRes([]));
    await fantasyApi.getWrestlerCosts();
    expect(callUrl()).toBe(`${API_BASE}/fantasy/wrestlers/costs`);
  });

  it('initializeWrestlerCosts sends POST with optional baseCost', async () => {
    fetchMock()
      .mockResolvedValueOnce(mockRes({ message: 'ok', count: 10 }))
      .mockResolvedValueOnce(mockRes({ message: 'ok', count: 10 }));
    await fantasyApi.initializeWrestlerCosts();
    expect(callBody(0)).toEqual({});
    await fantasyApi.initializeWrestlerCosts(500);
    expect(callBody(1)).toEqual({ baseCost: 500 });
    expect(callUrl(1)).toBe(`${API_BASE}/admin/fantasy/wrestlers/costs/initialize`);
  });

  it('recalculateWrestlerCosts sends POST to admin endpoint', async () => {
    fetchMock().mockResolvedValue(mockRes({ message: 'ok', playersUpdated: 5 }));
    await fantasyApi.recalculateWrestlerCosts();
    expect(callUrl()).toBe(`${API_BASE}/admin/fantasy/wrestlers/costs/recalculate`);
    expect(callOpts().method).toBe('POST');
  });

  it('updateWrestlerCost sends PUT with cost and optional reason', async () => {
    fetchMock().mockResolvedValue(mockRes({ playerId: 'p1', currentCost: 750 }));
    await fantasyApi.updateWrestlerCost('p1', 750, 'manual adjustment');
    expect(callUrl()).toBe(`${API_BASE}/admin/fantasy/wrestlers/p1/cost`);
    expect(callOpts().method).toBe('PUT');
    expect(callBody()).toEqual({ currentCost: 750, reason: 'manual adjustment' });
  });

  it('getLeaderboard calls GET /fantasy/leaderboard with optional seasonId', async () => {
    fetchMock().mockResolvedValueOnce(mockRes([])).mockResolvedValueOnce(mockRes([]));
    await fantasyApi.getLeaderboard();
    expect(callUrl(0)).toBe(`${API_BASE}/fantasy/leaderboard`);
    await fantasyApi.getLeaderboard('s1');
    expect(callUrl(1)).toBe(`${API_BASE}/fantasy/leaderboard?seasonId=s1`);
  });

  it('scoreCompletedEvents sends POST to /fantasy/score', async () => {
    fetchMock().mockResolvedValue(mockRes({ message: 'ok', scoredEventIds: ['e1'] }));
    await fantasyApi.scoreCompletedEvents();
    expect(callUrl()).toBe(`${API_BASE}/fantasy/score`);
    expect(callOpts().method).toBe('POST');
  });

  it('submitPicks sends POST to /fantasy/picks/:eventId with picks body', async () => {
    const picks = { match1: ['p1', 'p2'] };
    fetchMock().mockResolvedValue(mockRes({ eventId: 'e1', picks }));
    await fantasyApi.submitPicks('e1', picks);
    expect(callUrl()).toBe(`${API_BASE}/fantasy/picks/e1`);
    expect(callOpts().method).toBe('POST');
    expect(callBody()).toEqual({ picks });
  });

  it('getUserPicks calls GET /fantasy/picks/:eventId', async () => {
    fetchMock().mockResolvedValue(mockRes({ eventId: 'e1', picks: {} }));
    await fantasyApi.getUserPicks('e1');
    expect(callUrl()).toBe(`${API_BASE}/fantasy/picks/e1`);
    expect(callOpts().method).toBeUndefined();
  });

  it('getAllMyPicks calls GET /fantasy/me/picks', async () => {
    fetchMock().mockResolvedValue(mockRes([]));
    await fantasyApi.getAllMyPicks();
    expect(callUrl()).toBe(`${API_BASE}/fantasy/me/picks`);
  });

  it('clearPicks sends DELETE to /fantasy/picks/:eventId', async () => {
    fetchMock().mockResolvedValue(mockRes(undefined, 204));
    await fantasyApi.clearPicks('e1');
    expect(callUrl()).toBe(`${API_BASE}/fantasy/picks/e1`);
    expect(callOpts().method).toBe('DELETE');
  });
});

// ---------------------------------------------------------------------------
// challengesApi
// ---------------------------------------------------------------------------
describe('challengesApi', () => {
  it('getAll calls /challenges with optional status and playerId filters', async () => {
    fetchMock().mockResolvedValueOnce(mockRes([])).mockResolvedValueOnce(mockRes([]));
    await challengesApi.getAll();
    expect(callUrl(0)).toBe(`${API_BASE}/challenges`);
    await challengesApi.getAll({ status: 'pending', playerId: 'p1' });
    expect(callUrl(1)).toContain('status=pending');
    expect(callUrl(1)).toContain('playerId=p1');
  });

  it('getById calls /challenges/:id', async () => {
    fetchMock().mockResolvedValue(mockRes({ challengeId: 'ch1' }));
    const result = await challengesApi.getById('ch1');
    expect(callUrl()).toBe(`${API_BASE}/challenges/ch1`);
    expect(result).toEqual({ challengeId: 'ch1' });
  });

  it('create sends POST to /challenges', async () => {
    const input = { opponentId: 'p2', matchType: 'singles' };
    fetchMock().mockResolvedValue(mockRes({ challengeId: 'ch1', ...input }));
    // @ts-expect-error partial input for test
    await challengesApi.create(input);
    expect(callUrl()).toBe(`${API_BASE}/challenges`);
    expect(callOpts().method).toBe('POST');
    expect(callBody()).toEqual(input);
  });

  it('respond sends POST to /challenges/:id/respond with action and data', async () => {
    fetchMock().mockResolvedValue(mockRes({ challengeId: 'ch1', status: 'accepted' }));
    await challengesApi.respond('ch1', 'accept', { responseMessage: 'Bring it on!' });
    expect(callUrl()).toBe(`${API_BASE}/challenges/ch1/respond`);
    expect(callOpts().method).toBe('POST');
    expect(callBody()).toEqual({ action: 'accept', responseMessage: 'Bring it on!' });
  });

  it('cancel sends POST to /challenges/:id/cancel', async () => {
    fetchMock().mockResolvedValue(mockRes({ challengeId: 'ch1', status: 'cancelled' }));
    await challengesApi.cancel('ch1');
    expect(callUrl()).toBe(`${API_BASE}/challenges/ch1/cancel`);
    expect(callOpts().method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// promosApi
// ---------------------------------------------------------------------------
describe('promosApi', () => {
  it('getAll calls /promos with optional playerId and promoType filters', async () => {
    fetchMock().mockResolvedValueOnce(mockRes([])).mockResolvedValueOnce(mockRes([]));
    await promosApi.getAll();
    expect(callUrl(0)).toBe(`${API_BASE}/promos`);
    await promosApi.getAll({ playerId: 'p1', promoType: 'callout' });
    expect(callUrl(1)).toContain('playerId=p1');
    expect(callUrl(1)).toContain('promoType=callout');
  });

  it('getById calls /promos/:id and returns promo with responses', async () => {
    const data = { promo: { promoId: 'pr1' }, responses: [] };
    fetchMock().mockResolvedValue(mockRes(data));
    const result = await promosApi.getById('pr1');
    expect(callUrl()).toBe(`${API_BASE}/promos/pr1`);
    expect(result.promo).toEqual({ promoId: 'pr1' });
    expect(result.responses).toEqual([]);
  });

  it('create sends POST to /promos', async () => {
    const input = { promoType: 'callout', content: 'You want some?' };
    fetchMock().mockResolvedValue(mockRes({ promoId: 'pr1', ...input }));
    // @ts-expect-error partial input for test
    await promosApi.create(input);
    expect(callUrl()).toBe(`${API_BASE}/promos`);
    expect(callOpts().method).toBe('POST');
    expect(callBody()).toEqual(input);
  });

  it('react sends POST to /promos/:id/react with reaction type', async () => {
    fetchMock().mockResolvedValue(mockRes({ reactions: {}, reactionCounts: {} }));
    // @ts-expect-error partial input for test
    await promosApi.react('pr1', 'fire');
    expect(callUrl()).toBe(`${API_BASE}/promos/pr1/react`);
    expect(callOpts().method).toBe('POST');
    expect(callBody()).toEqual({ reaction: 'fire' });
  });

  it('adminUpdate sends PUT to /admin/promos/:id', async () => {
    fetchMock().mockResolvedValue(mockRes({ promoId: 'pr1', isPinned: true }));
    await promosApi.adminUpdate('pr1', { isPinned: true });
    expect(callUrl()).toBe(`${API_BASE}/admin/promos/pr1`);
    expect(callOpts().method).toBe('PUT');
    expect(callBody()).toEqual({ isPinned: true });
  });
});

// ---------------------------------------------------------------------------
// imagesApi
// ---------------------------------------------------------------------------
describe('imagesApi', () => {
  it('generateUploadUrl sends POST to /images/upload-url', async () => {
    const res = { uploadUrl: 'https://s3.example.com/presigned', imageUrl: 'https://cdn/img.png', fileKey: 'wrestlers/img.png' };
    fetchMock().mockResolvedValue(mockRes(res));
    const result = await imagesApi.generateUploadUrl('photo.png', 'image/png', 'wrestlers');
    expect(callUrl()).toBe(`${API_BASE}/images/upload-url`);
    expect(callOpts().method).toBe('POST');
    expect(callBody()).toEqual({ fileName: 'photo.png', fileType: 'image/png', folder: 'wrestlers' });
    expect(result.uploadUrl).toBe('https://s3.example.com/presigned');
  });

  it('uploadToS3 sends PUT to presigned URL with file body and Content-Type', async () => {
    fetchMock().mockResolvedValue({ ok: true, status: 200 });
    const file = new File(['image-data'], 'photo.png', { type: 'image/png' });
    await imagesApi.uploadToS3('https://s3.example.com/presigned', file);
    expect(callUrl()).toBe('https://s3.example.com/presigned');
    expect(callOpts().method).toBe('PUT');
    expect(fetchMock().mock.calls[0][1].body).toBe(file);
    expect((callOpts().headers as Record<string, string>)['Content-Type']).toBe('image/png');
  });

  it('uploadToS3 throws when S3 returns non-ok response', async () => {
    fetchMock().mockResolvedValue({ ok: false, status: 403 });
    const file = new File(['data'], 'photo.png', { type: 'image/png' });
    await expect(imagesApi.uploadToS3('https://s3.example.com/presigned', file))
      .rejects.toThrow('Failed to upload image');
  });
});
