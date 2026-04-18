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

  it('returns 403 when user only has Fantasy role', async () => {
    const event = withAuth(
      makeEvent({
        body: JSON.stringify({ fileName: 'photo.jpg', fileType: 'image/jpeg', folder: 'wrestlers' }),
      }),
      'Fantasy',
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
    expect(JSON.parse(result!.body).message).toBe('folder must be "wrestlers", "championships", "shows", or "videos"');
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
});
