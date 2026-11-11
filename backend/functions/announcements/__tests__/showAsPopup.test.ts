import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctx, cb, makeEvent, withAuth } from '../../rivalries/__tests__/testHelpers';
import { InMemoryContentRepository } from '../../../lib/repositories/inMemory/InMemoryContentRepository';

const content = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../../../lib/repositories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/repositories')>();
  return { ...actual, getRepositories: () => ({ content: content.current }) };
});

import { handler as createAnnouncement } from '../createAnnouncement';
import { handler as updateAnnouncement } from '../updateAnnouncement';
import { handler as getActiveAnnouncements } from '../getActiveAnnouncements';

function create(body: Record<string, unknown>) {
  return createAnnouncement(withAuth(makeEvent({ body: JSON.stringify(body) }), 'Admin'), ctx, cb);
}

function update(announcementId: string, body: Record<string, unknown>) {
  return updateAnnouncement(
    withAuth(makeEvent({ httpMethod: 'PUT', pathParameters: { announcementId }, body: JSON.stringify(body) }), 'Moderator'),
    ctx,
    cb,
  );
}

async function active(): Promise<Array<{ announcementId: string; showAsPopup?: boolean }>> {
  const res = await getActiveAnnouncements(makeEvent({ httpMethod: 'GET' }), ctx, cb);
  return JSON.parse(res!.body);
}

beforeEach(() => {
  content.current = new InMemoryContentRepository();
});

describe('announcement showAsPopup flag', () => {
  it('is off unless asked for', async () => {
    const res = await create({ title: 'Routine', body: '<p>Body</p>' });

    expect(res!.statusCode).toBe(201);
    expect(JSON.parse(res!.body).showAsPopup).toBe(false);
    expect((await active())[0]?.showAsPopup).toBe(false);
  });

  it('round-trips through create, update and the public list', async () => {
    const res = await create({ title: 'Big news', body: '<p>Body</p>', showAsPopup: true });
    const { announcementId } = JSON.parse(res!.body);
    expect((await active())[0]).toMatchObject({ announcementId, showAsPopup: true });

    const off = await update(announcementId, { showAsPopup: false });
    expect(off!.statusCode).toBe(200);
    expect(JSON.parse(off!.body).showAsPopup).toBe(false);
    expect((await active())[0]?.showAsPopup).toBe(false);

    await update(announcementId, { showAsPopup: true });
    expect((await active())[0]?.showAsPopup).toBe(true);
  });

  it('leaves the flag alone when an update does not mention it', async () => {
    const res = await create({ title: 'Big news', body: '<p>Body</p>', showAsPopup: true });
    const { announcementId } = JSON.parse(res!.body);

    await update(announcementId, { title: 'Bigger news' });
    expect((await active())[0]).toMatchObject({ title: 'Bigger news', showAsPopup: true });
  });

  it('rejects a flag that is not a boolean', async () => {
    expect((await create({ title: 'T', body: 'B', showAsPopup: 'yes' }))!.statusCode).toBe(400);
    const { announcementId } = JSON.parse((await create({ title: 'T', body: 'B' }))!.body);
    expect((await update(announcementId, { showAsPopup: 'yes' }))!.statusCode).toBe(400);
  });
});
