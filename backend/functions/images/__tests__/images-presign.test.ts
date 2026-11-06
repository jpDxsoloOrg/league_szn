import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';
import { handler as generateUploadUrl } from '../generateUploadUrl';

// Runs the real presigner with placeholder credentials. Signing is local, so
// nothing here reaches AWS. The other test files mock the presigner and cannot
// show which headers end up in the signature.

const ctx = {} as Context;
const cb: Callback = () => {};

function makeEvent(body: Record<string, string>): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    requestContext: {
      authorizer: { groups: 'Admin', username: 'testuser', email: 'test@test.com', principalId: 'user-sub-1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('generateUploadUrl — real presigned URL', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      IMAGES_BUCKET: 'test-images-bucket',
      AWS_ACCESS_KEY_ID: 'placeholder-access-key',
      AWS_SECRET_ACCESS_KEY: 'placeholder-secret-key',
    };
    delete process.env.AWS_PROFILE;
    delete process.env.AWS_SESSION_TOKEN;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it.each([
    ['image/jpeg', 'wrestlers'],
    ['video/mp4', 'videos'],
    ['image/webp', 'videos'],
  ])('signs the content type header for %s in %s', async (fileType, folder) => {
    const result = await generateUploadUrl(
      makeEvent({ fileName: 'upload.bin', fileType, folder }),
      ctx,
      cb,
    );

    expect(result!.statusCode).toBe(200);
    const { uploadUrl } = JSON.parse(result!.body) as { uploadUrl: string };
    const signedHeaders = new URL(uploadUrl).searchParams.get('X-Amz-SignedHeaders');
    expect(signedHeaders?.split(';')).toEqual(['content-type', 'host']);
  });

  it('keeps the 5 minute expiry', async () => {
    const result = await generateUploadUrl(
      makeEvent({ fileName: 'upload.bin', fileType: 'image/png', folder: 'shows' }),
      ctx,
      cb,
    );

    const { uploadUrl } = JSON.parse(result!.body) as { uploadUrl: string };
    expect(new URL(uploadUrl).searchParams.get('X-Amz-Expires')).toBe('300');
  });
});
