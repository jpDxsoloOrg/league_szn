import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGetSignedUrl, mockPutObjectCommand, mockS3Client, mockFindByUserId } = vi.hoisted(() => ({
  mockGetSignedUrl: vi.fn(),
  mockPutObjectCommand: vi.fn(),
  mockS3Client: vi.fn(),
  mockFindByUserId: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: mockS3Client,
  PutObjectCommand: mockPutObjectCommand,
}));

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({
    roster: { players: { findByUserId: mockFindByUserId } },
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
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
    requestContext: { authorizer: {} } as any,
    ...overrides,
  };
}

function withAuth(event: APIGatewayProxyEvent, groups: string, sub = 'user-sub-1'): APIGatewayProxyEvent {
  return {
    ...event,
    requestContext: {
      ...event.requestContext,
      authorizer: { groups, username: 'testuser', email: 'test@test.com', principalId: sub },
    } as any,
  };
}

// ─── Import handler (after mocks are set up) ────────────────────────

import { handler as generateUploadUrl } from '../generateUploadUrl';

// ─── generateUploadUrl — Auth, parsing & validation ─────────────────

describe('generateUploadUrl — auth & validation', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, IMAGES_BUCKET: 'test-images-bucket' };
    mockGetSignedUrl.mockResolvedValue('https://presigned-url.example.com/upload');
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ─── Auth ───────────────────────────────────────────────────────

  it('returns 403 when user has no authorized role (no groups)', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      '',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toContain('permission');
  });

  it('returns 403 when user has no role', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      '',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(403);
  });

  it('allows Wrestler role to generate upload URL', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Wrestler',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  it('allows Moderator role to generate upload URL', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Moderator',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  it('allows Admin role to generate upload URL', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  // ─── Body parsing ──────────────────────────────────────────────

  it('returns 400 when request body is missing', async () => {
    const event = withAuth(makeEvent({ body: null }), 'Admin');

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Request body is required');
  });

  it('returns 400 when request body is invalid JSON', async () => {
    const event = withAuth(makeEvent({ body: 'not-json{{{' }), 'Admin');

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid JSON in request body');
  });

  // ─── Required field validation ────────────────────────────────

  it('returns 400 when fileName is missing', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ fileType: 'image/jpeg', folder: 'wrestlers' }) }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('fileName, fileType, and folder are required');
  });

  it('returns 400 when fileType is missing', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ fileName: 'photo.jpg', folder: 'wrestlers' }) }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('fileName, fileType, and folder are required');
  });

  it('returns 400 when folder is missing', async () => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg' }) }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('fileName, fileType, and folder are required');
  });

  it('returns 400 when all required fields are missing (empty object)', async () => {
    const event = withAuth(makeEvent({ body: JSON.stringify({}) }), 'Admin');

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('fileName, fileType, and folder are required');
  });

  // ─── Folder validation ────────────────────────────────────────

  it('returns 400 when folder is not a valid option', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'invalid-folder' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('folder must be "wrestlers", "championships", "shows", "videos", or "factions"');
  });

  it('accepts "wrestlers" as a valid folder', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  it('accepts "championships" as a valid folder', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.png', fileType: 'image/png', folder: 'championships' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  it('accepts "factions" as a valid folder and prefixes the file key with factions/', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'banner.png', fileType: 'image/png', folder: 'factions' }),
      }),
      'Wrestler',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const responseBody = JSON.parse(result!.body) as { fileKey: string; imageUrl: string };
    expect(responseBody.fileKey.startsWith('factions/')).toBe(true);
    expect(responseBody.imageUrl).toContain('/factions/');
  });

  it('rejects disallowed file types when folder is "factions"', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'doc.pdf', fileType: 'application/pdf', folder: 'factions' }),
      }),
      'Wrestler',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Only JPEG, PNG, GIF, and WebP');
  });

  // ─── File type validation ─────────────────────────────────────

  it('returns 400 for disallowed file type (application/pdf)', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'doc.pdf', fileType: 'application/pdf', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Invalid file type');
  });

  it('returns 400 for disallowed file type (text/plain)', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'notes.txt', fileType: 'text/plain', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Only JPEG, PNG, GIF, and WebP');
  });

  it.each([
    ['image/jpeg', 'photo.jpg'],
    ['image/png', 'photo.png'],
    ['image/gif', 'anim.gif'],
    ['image/webp', 'photo.webp'],
  ])('accepts %s file type', async (fileType, fileName) => {
    const event = withAuth(
      makeEvent({ body: JSON.stringify({ fileName, fileType, folder: 'wrestlers' }) }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
  });

  // ─── File type lookup ─────────────────────────────────────────

  it.each(['constructor', '__proto__', 'toString', 'text/html', 'image/svg+xml'])(
    'returns 400 for file type %s',
    async (fileType) => {
      const event = withAuth(
        makeEvent({ body: JSON.stringify({ fileName: 'photo.jpg', fileType, folder: 'wrestlers' }) }),
        'Admin',
      );

      const result = await generateUploadUrl(event, ctx, cb);

      expect(result!.statusCode).toBe(400);
    },
  );

  it('returns 400 when fileType is not a string', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: ['image/jpeg'], folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });

  it('rejects video types outside the videos folder', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'clip.mp4', fileType: 'video/mp4', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(400);
  });

  // ─── Videos folder permission ─────────────────────────────────

  describe('videos folder permission', () => {
    const videoBody = JSON.stringify({ fileName: 'clip.mp4', fileType: 'video/mp4', folder: 'videos' });

    it.each(['Admin', 'Moderator'])('allows %s without a player lookup', async (group) => {
      const result = await generateUploadUrl(withAuth(makeEvent({ body: videoBody }), group), ctx, cb);

      expect(result!.statusCode).toBe(200);
      expect(mockFindByUserId).not.toHaveBeenCalled();
    });

    it('allows a Wrestler whose player has canUploadVideos', async () => {
      mockFindByUserId.mockResolvedValue({ playerId: 'p1', canUploadVideos: true });

      const result = await generateUploadUrl(withAuth(makeEvent({ body: videoBody }), 'Wrestler'), ctx, cb);

      expect(result!.statusCode).toBe(200);
      expect(mockFindByUserId).toHaveBeenCalledWith('user-sub-1');
    });

    it('allows a permitted Wrestler to upload an image thumbnail', async () => {
      mockFindByUserId.mockResolvedValue({ playerId: 'p1', canUploadVideos: true });
      const body = JSON.stringify({ fileName: 'thumb.png', fileType: 'image/png', folder: 'videos' });

      const result = await generateUploadUrl(withAuth(makeEvent({ body }), 'Wrestler'), ctx, cb);

      expect(result!.statusCode).toBe(200);
    });

    it.each([
      ['flag is false', { playerId: 'p1', canUploadVideos: false }],
      ['flag is unset', { playerId: 'p1' }],
      ['no player is linked', null],
    ])('returns 403 for a Wrestler when %s', async (_label, player) => {
      mockFindByUserId.mockResolvedValue(player);

      const result = await generateUploadUrl(withAuth(makeEvent({ body: videoBody }), 'Wrestler'), ctx, cb);

      expect(result!.statusCode).toBe(403);
      expect(JSON.parse(result!.body).message).toBe('Your account is not permitted to upload videos');
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('returns 403 for a Wrestler with no subject claim', async () => {
      const result = await generateUploadUrl(withAuth(makeEvent({ body: videoBody }), 'Wrestler', ''), ctx, cb);

      expect(result!.statusCode).toBe(403);
      expect(mockFindByUserId).not.toHaveBeenCalled();
    });

    it('does not look up the player for other folders', async () => {
      const body = JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' });

      const result = await generateUploadUrl(withAuth(makeEvent({ body }), 'Wrestler'), ctx, cb);

      expect(result!.statusCode).toBe(200);
      expect(mockFindByUserId).not.toHaveBeenCalled();
    });

    it('returns 500 when the player lookup fails', async () => {
      mockFindByUserId.mockRejectedValue(new Error('lookup failed'));

      const result = await generateUploadUrl(withAuth(makeEvent({ body: videoBody }), 'Wrestler'), ctx, cb);

      expect(result!.statusCode).toBe(500);
    });

    it('skips the check when running offline', async () => {
      process.env.IS_OFFLINE = 'true';

      const result = await generateUploadUrl(makeEvent({ body: videoBody }), ctx, cb);

      expect(result!.statusCode).toBe(200);
      expect(mockFindByUserId).not.toHaveBeenCalled();
    });
  });
});
