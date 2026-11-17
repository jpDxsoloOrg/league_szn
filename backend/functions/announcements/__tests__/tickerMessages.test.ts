import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from '../../rivalries/__tests__/testHelpers';
import { InMemoryContentRepository } from '../../../lib/repositories/inMemory/InMemoryContentRepository';
import type { TickerMessage } from '../../../lib/repositories';

let content = new InMemoryContentRepository();

vi.mock('../../../lib/repositories', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/repositories')>()),
  getRepositories: () => ({ content }),
}));

import { handler as listTickerMessages } from '../listTickerMessages';
import { handler as createTickerMessage } from '../createTickerMessage';
import { handler as updateTickerMessage } from '../updateTickerMessage';
import { handler as deleteTickerMessage } from '../deleteTickerMessage';
import { validateCreateTickerMessage } from '../tickerMessageValidation';

const START = '2026-11-16T12:00:00.000Z';
const END = '2026-11-20T12:00:00.000Z';

const post = (body: unknown, groups = 'Moderator') =>
  withAuth(makeEvent({ httpMethod: 'POST', body: JSON.stringify(body) }), groups);
const put = (messageId: string, body: unknown, groups = 'Moderator') =>
  withAuth(makeEvent({ httpMethod: 'PUT', body: JSON.stringify(body), pathParameters: { messageId } }), groups);

async function seed(overrides: Partial<TickerMessage> = {}): Promise<TickerMessage> {
  const message = await content.tickerMessages.create({
    text: 'Draft night this Friday!',
    startsAt: START,
    expiresAt: END,
    createdBy: 'gm',
  });
  const stored = { ...message, ...overrides };
  content.tickerMessages.store.set(stored.messageId, stored);
  return stored;
}

beforeEach(() => {
  content = new InMemoryContentRepository();
});

describe('ticker message auth', () => {
  it.each([
    ['no role', ''],
    ['Wrestler', 'Wrestler'],
    ['Fantasy', 'Fantasy'],
  ])('rejects %s on every route', async (_label, groups) => {
    const message = await seed();
    const responses = await Promise.all([
      listTickerMessages(withAuth(makeEvent({ httpMethod: 'GET' }), groups), ctx, cb),
      createTickerMessage(post({ text: 'Hi', expiresAt: END }, groups), ctx, cb),
      updateTickerMessage(put(message.messageId, { text: 'Hi' }, groups), ctx, cb),
      deleteTickerMessage(
        withAuth(makeEvent({ httpMethod: 'DELETE', pathParameters: { messageId: message.messageId } }), groups),
        ctx,
        cb,
      ),
    ]);
    expect(responses.map((res) => res!.statusCode)).toEqual([403, 403, 403, 403]);
    expect(content.tickerMessages.store.get(message.messageId)?.text).toBe('Draft night this Friday!');
  });

  it.each(['Moderator', 'Admin'])('lets %s create and list', async (groups) => {
    const res = await createTickerMessage(post({ text: 'Draft night!', startsAt: START, expiresAt: END }, groups), ctx, cb);
    expect(res!.statusCode).toBe(201);
    expect(JSON.parse(res!.body)).toMatchObject({ text: 'Draft night!', pinned: false, createdBy: 'tester' });

    const list = await listTickerMessages(withAuth(makeEvent({ httpMethod: 'GET' }), groups), ctx, cb);
    expect(JSON.parse(list!.body)).toHaveLength(1);
  });
});

describe('ticker message validation', () => {
  it('accepts exactly 140 characters and rejects 141', async () => {
    const ok = await createTickerMessage(post({ text: 'x'.repeat(140), startsAt: START, expiresAt: END }), ctx, cb);
    const tooLong = await createTickerMessage(post({ text: 'x'.repeat(141), startsAt: START, expiresAt: END }), ctx, cb);
    expect(ok!.statusCode).toBe(201);
    expect(tooLong!.statusCode).toBe(400);
    expect(tooLong!.body).toContain('140');
  });

  it('rejects blank text, a missing expiry and an expiry not after the start', async () => {
    const blank = await createTickerMessage(post({ text: '   ', expiresAt: END }), ctx, cb);
    const noExpiry = await createTickerMessage(post({ text: 'Hi', startsAt: START }), ctx, cb);
    const same = await createTickerMessage(post({ text: 'Hi', startsAt: START, expiresAt: START }), ctx, cb);
    const before = await createTickerMessage(post({ text: 'Hi', startsAt: END, expiresAt: START }), ctx, cb);
    expect([blank, noExpiry, same, before].map((res) => res!.statusCode)).toEqual([400, 400, 400, 400]);
    expect(content.tickerMessages.store.size).toBe(0);
  });

  it('allows site paths and http(s) links only', () => {
    const base = { text: 'Hi', startsAt: START, expiresAt: END };
    expect(validateCreateTickerMessage({ ...base, href: '/events' }).value?.href).toBe('/events');
    expect(validateCreateTickerMessage({ ...base, href: 'https://example.com/x' }).value?.href).toBe('https://example.com/x');
    expect(validateCreateTickerMessage({ ...base, href: '//evil.example' }).error).toBeDefined();
    expect(validateCreateTickerMessage({ ...base, href: 'javascript:alert(1)' }).error).toBeDefined();
  });

  it('defaults startsAt to now', () => {
    const now = new Date('2026-11-16T09:00:00.000Z');
    const result = validateCreateTickerMessage({ text: 'Hi', expiresAt: END }, now);
    expect(result.value?.startsAt).toBe(now.toISOString());
  });

  it('checks an update window against the stored dates', async () => {
    const message = await seed();
    const bad = await updateTickerMessage(put(message.messageId, { expiresAt: '2026-11-10T00:00:00.000Z' }), ctx, cb);
    expect(bad!.statusCode).toBe(400);

    const ok = await updateTickerMessage(put(message.messageId, { text: 'Edited', pinned: true }), ctx, cb);
    expect(ok!.statusCode).toBe(200);
    expect(JSON.parse(ok!.body)).toMatchObject({ text: 'Edited', pinned: true, startsAt: START, expiresAt: END });
  });

  it('clears a link when href is null', async () => {
    const message = await seed({ href: '/events' });
    const res = await updateTickerMessage(put(message.messageId, { href: null }), ctx, cb);
    expect(JSON.parse(res!.body).href).toBeUndefined();
  });

  it('returns 404 for an unknown message', async () => {
    const res = await updateTickerMessage(put('missing', { text: 'Hi' }), ctx, cb);
    const del = await deleteTickerMessage(
      withAuth(makeEvent({ httpMethod: 'DELETE', pathParameters: { messageId: 'missing' } }), 'Admin'),
      ctx,
      cb,
    );
    expect(res!.statusCode).toBe(404);
    expect(del!.statusCode).toBe(404);
  });

  it('expires a message now', async () => {
    const message = await seed({ startsAt: '2026-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' });
    expect(await content.tickerMessages.listActive()).toHaveLength(1);

    const res = await updateTickerMessage(put(message.messageId, { expiresAt: new Date().toISOString() }), ctx, cb);
    expect(res!.statusCode).toBe(200);
    expect(await content.tickerMessages.listActive()).toHaveLength(0);
  });
});
