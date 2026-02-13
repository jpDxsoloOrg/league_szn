import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockGetSignedUrl, mockPutObjectCommand, mockS3Client } = vi.hoisted(() => ({
  mockGetSignedUrl: vi.fn(),
  mockPutObjectCommand: vi.fn(),
  mockS3Client: vi.fn(),
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

// ─── generateUploadUrl — Success paths & S3 integration ─────────────

describe('generateUploadUrl — success & S3 integration', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, IMAGES_BUCKET: 'test-images-bucket' };
    mockGetSignedUrl.mockResolvedValue('https://presigned-url.example.com/upload');
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ─── IMAGES_BUCKET env check ──────────────────────────────────

  it('returns 500 when IMAGES_BUCKET env var is not set', async () => {
    delete process.env.IMAGES_BUCKET;

    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('S3 bucket not configured');
  });

  // ─── Success response structure ───────────────────────────────

  it('returns uploadUrl, imageUrl, and fileKey on success', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.uploadUrl).toBe('https://presigned-url.example.com/upload');
    expect(body.imageUrl).toBe('https://test-images-bucket.s3.amazonaws.com/wrestlers/test-uuid-1234.jpg');
    expect(body.fileKey).toBe('wrestlers/test-uuid-1234.jpg');
  });

  it('generates fileKey using folder and UUID with correct extension', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'banner.png', fileType: 'image/png', folder: 'championships' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.fileKey).toBe('championships/test-uuid-1234.png');
    expect(body.imageUrl).toContain('championships/test-uuid-1234.png');
  });

  it('uses last segment after dot as file extension', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'my.photo.file.webp', fileType: 'image/webp', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.fileKey).toBe('wrestlers/test-uuid-1234.webp');
  });

  it('uses fileName itself as extension when no dot present', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    const body = JSON.parse(result!.body);
    // 'photo'.split('.').pop() returns 'photo' (single element, pop returns it)
    expect(body.fileKey).toBe('wrestlers/test-uuid-1234.photo');
  });

  it('constructs imageUrl from bucket name and fileKey', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'belt.gif', fileType: 'image/gif', folder: 'championships' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    const body = JSON.parse(result!.body);
    expect(body.imageUrl).toBe(`https://test-images-bucket.s3.amazonaws.com/${body.fileKey}`);
  });

  // ─── S3 command construction ──────────────────────────────────

  it('creates PutObjectCommand with correct bucket, key, and content type', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    await generateUploadUrl(event, ctx, cb);

    expect(mockPutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-images-bucket',
      Key: 'wrestlers/test-uuid-1234.jpg',
      ContentType: 'image/jpeg',
    });
  });

  it('calls getSignedUrl with 300 second (5 minute) expiration', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    await generateUploadUrl(event, ctx, cb);

    expect(mockGetSignedUrl).toHaveBeenCalledOnce();
    const callArgs = mockGetSignedUrl.mock.calls[0];
    expect(callArgs[2]).toEqual({ expiresIn: 300 });
  });

  // ─── S3 error handling ────────────────────────────────────────

  it('returns 500 when getSignedUrl throws an error', async () => {
    mockGetSignedUrl.mockRejectedValue(new Error('S3 service unavailable'));

    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to generate upload URL');
  });

  it('returns 500 when PutObjectCommand constructor throws', async () => {
    mockPutObjectCommand.mockImplementation(() => {
      throw new Error('Invalid S3 params');
    });

    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Admin',
    );

    const result = await generateUploadUrl(event, ctx, cb);

    expect(result!.statusCode).toBe(500);
    expect(JSON.parse(result!.body).message).toBe('Failed to generate upload URL');
  });
});
