import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  resetRepositoriesForTesting,
  setRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { expirePendingInvitations } from '../leavePresence';

let repos: Repositories;

const invite = async (invitationId: string, status = 'pending') => {
  const { matchmaking } = repos.leagueOps;
  await matchmaking.putInvitation({
    invitationId,
    fromPlayerId: 'p1',
    toPlayerId: 'p2',
    status,
  } as Parameters<typeof matchmaking.putInvitation>[0]);
};

const statusOf = async (invitationId: string) =>
  (await repos.leagueOps.matchmaking.getInvitation(invitationId))?.status;

beforeEach(() => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
});

afterEach(() => {
  resetRepositoriesForTesting();
  vi.restoreAllMocks();
});

describe('expirePendingInvitations', () => {
  it('expires pending invitations and leaves the rest', async () => {
    await invite('open');
    await invite('done', 'accepted');

    await expirePendingInvitations('from', 'p1');

    expect(await statusOf('open')).toBe('expired');
    expect(await statusOf('done')).toBe('accepted');
  });

  it('writes on condition that the invitation is still pending', async () => {
    await invite('open');
    const update = vi.spyOn(repos.leagueOps.matchmaking, 'updateInvitation');

    await expirePendingInvitations('to', 'p2');

    expect(update).toHaveBeenCalledWith('open', expect.objectContaining({ status: 'expired' }), 'pending');
  });

  it('leaves an invitation accepted between the read and the write', async () => {
    await invite('raced');
    const { matchmaking } = repos.leagueOps;
    const realUpdate = matchmaking.updateInvitation.bind(matchmaking);
    vi.spyOn(matchmaking, 'updateInvitation').mockImplementationOnce(async (id, patch, condition) => {
      await realUpdate(id, { status: 'accepted' });
      return realUpdate(id, patch, condition);
    });

    await expect(expirePendingInvitations('from', 'p1')).resolves.toBeUndefined();

    expect(await statusOf('raced')).toBe('accepted');
  });

  it('lets other errors through', async () => {
    await invite('open');
    vi.spyOn(repos.leagueOps.matchmaking, 'updateInvitation').mockRejectedValueOnce(new Error('throttled'));

    await expect(expirePendingInvitations('from', 'p1')).rejects.toThrow('throttled');
  });
});
