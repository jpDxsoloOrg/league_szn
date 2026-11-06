import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import type { Challenge, ChallengeStatus } from '../../../lib/repositories/types';
import { handler as expireChallenges } from '../expireChallenges';
import { handler as respondToChallenge } from '../respondToChallenge';
import { handler as getActivity } from '../../activity/getActivity';
import { authedEvent, call, makeEvent } from '../../__tests__/visibilityTestHelpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-15T12:00:00.000Z');

let repos: Repositories;
let challengerId: string;
let challengedId: string;

/** Creates a challenge backdated by `ageDays`, with a matching `expiresAt`. */
async function challengeAged(ageDays: number, expiryDays = 4): Promise<Challenge> {
  const createdMs = NOW - ageDays * DAY_MS;
  vi.setSystemTime(createdMs);
  const challenge = await repos.user.challenges.create({
    challengerId,
    challengedId,
    matchType: 'singles',
    expiresAt: new Date(createdMs + expiryDays * DAY_MS).toISOString(),
  });
  vi.setSystemTime(NOW);
  return challenge;
}

async function statusOf(challengeId: string): Promise<ChallengeStatus | undefined> {
  return (await repos.user.challenges.findById(challengeId))?.status;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  const create = (name: string, currentWrestler: string) =>
    repos.roster.players.create({ name, currentWrestler });
  challengerId = (await create('Challenger', 'The Rock')).playerId;
  const challenged = await create('Challenged', 'Kane');
  challengedId = challenged.playerId;
  await repos.roster.players.update(challengedId, { userId: 'challenged-sub' });
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('expireChallenges', () => {
  it('expires overdue pending challenges and leaves the rest alone', async () => {
    const overdue = await challengeAged(5);
    const current = await challengeAged(1);

    const result = await expireChallenges();

    expect(result).toEqual({ pending: 2, expired: 1, skipped: 0, failed: 0 });
    expect(await statusOf(overdue.challengeId)).toBe('expired');
    expect(await statusOf(current.challengeId)).toBe('pending');
  });

  it('expires rows written with a seven day expiresAt once they pass four days', async () => {
    const legacy = await challengeAged(5, 7);
    await expireChallenges();
    expect(await statusOf(legacy.challengeId)).toBe('expired');
  });

  it('does not touch challenges in other statuses', async () => {
    const accepted = await challengeAged(30);
    await repos.user.challenges.update(accepted.challengeId, { status: 'accepted' });

    const result = await expireChallenges();

    expect(result.pending).toBe(0);
    expect(await statusOf(accepted.challengeId)).toBe('accepted');
  });

  it('does not overwrite a challenge accepted after the sweep listed it', async () => {
    const racing = await challengeAged(5);
    const { challenges } = repos.user;
    const listed = await challenges.listByStatus('pending');
    vi.spyOn(challenges, 'listByStatus').mockImplementation(async () => {
      await challenges.update(racing.challengeId, { status: 'accepted' });
      return listed;
    });

    const result = await expireChallenges();

    expect(result).toMatchObject({ expired: 0, skipped: 1 });
    expect(await statusOf(racing.challengeId)).toBe('accepted');
  });

  it('keeps sweeping after one row fails', async () => {
    const first = await challengeAged(6);
    const second = await challengeAged(5);
    const { challenges } = repos.user;
    const realExpire = challenges.expireIfPending.bind(challenges);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(challenges, 'expireIfPending').mockImplementation(async (challengeId) => {
      if (challengeId === first.challengeId) throw new Error('throttled');
      return realExpire(challengeId);
    });

    const result = await expireChallenges();

    expect(result).toMatchObject({ expired: 1, failed: 1 });
    expect(await statusOf(second.challengeId)).toBe('expired');
  });

  it('does not change updatedAt, so expiring does not read as new activity', async () => {
    const overdue = await challengeAged(5);
    await expireChallenges();
    const after = await repos.user.challenges.findById(overdue.challengeId);
    expect(after?.updatedAt).toBe(overdue.updatedAt);
  });

  it('keeps expired challenges out of the activity feed', async () => {
    await challengeAged(5);
    await expireChallenges();

    const { body } = await call<{ items: unknown[] }>(getActivity, makeEvent());

    expect(body.items).toEqual([]);
  });
});

describe('expireIfPending', () => {
  it('resolves false and writes nothing unless the row is pending', async () => {
    const challenge = await challengeAged(5);
    await repos.user.challenges.update(challenge.challengeId, { status: 'declined' });

    expect(await repos.user.challenges.expireIfPending(challenge.challengeId)).toBe(false);
    expect(await repos.user.challenges.expireIfPending('missing')).toBe(false);
    expect(await statusOf(challenge.challengeId)).toBe('declined');
  });
});

describe('respondToChallenge expiry', () => {
  const respond = (challengeId: string, body: Record<string, unknown>) =>
    call<{ message?: string }>(
      respondToChallenge,
      authedEvent('challenged-sub', 'Wrestler', {
        pathParameters: { challengeId },
        body: JSON.stringify(body),
      }),
    );

  it.each([
    ['accept', { action: 'accept' }],
    ['decline', { action: 'decline' }],
    ['counter', { action: 'counter', counterMatchType: 'ladder' }],
  ])('rejects %s on an expired challenge', async (_label, body) => {
    const challenge = await challengeAged(5);

    const { statusCode, body: response } = await respond(challenge.challengeId, body);

    expect(statusCode).toBe(400);
    expect(response.message).toBe('Challenge expired');
    expect(await statusOf(challenge.challengeId)).toBe('pending');
  });

  it('rejects a pending legacy row past four days even with a later expiresAt', async () => {
    const legacy = await challengeAged(5, 7);
    const { statusCode } = await respond(legacy.challengeId, { action: 'accept' });
    expect(statusCode).toBe(400);
  });

  it('still accepts a challenge inside the window', async () => {
    const challenge = await challengeAged(3.9);
    const { statusCode } = await respond(challenge.challengeId, { action: 'accept' });
    expect(statusCode).toBe(200);
    expect(await statusOf(challenge.challengeId)).toBe('accepted');
  });

  it('gives a counter the four day expiry', async () => {
    const challenge = await challengeAged(1);
    const { statusCode } = await respond(challenge.challengeId, {
      action: 'counter',
      counterMatchType: 'ladder',
    });
    expect(statusCode).toBe(200);
    const pending = await repos.user.challenges.listByStatus('pending');
    expect(Date.parse(pending[0].expiresAt)).toBe(NOW + 4 * DAY_MS);
  });
});
