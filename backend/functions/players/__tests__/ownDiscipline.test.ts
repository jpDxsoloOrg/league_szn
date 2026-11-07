import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockIsSignupRefused } = vi.hoisted(() => ({ mockIsSignupRefused: vi.fn() }));

vi.mock('../../../lib/accountStatus', () => ({ isSignupRefused: mockIsSignupRefused }));
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
import { authedEvent, call } from '../../__tests__/visibilityTestHelpers';
import { handler as getMyProfile } from '../getMyProfile';
import { handler as updateMyProfile } from '../updateMyProfile';

const SUB = 'player-sub';
const STORED_FIELDS = ['strikes', 'deactivations', 'deactivatedAt', 'disciplineVersion', 'signupGuardKey'];

let repos: Repositories;
let playerId: string;

const update = (body: Record<string, unknown>) =>
  call<Record<string, unknown>>(updateMyProfile, authedEvent(SUB, 'Wrestler', { body: JSON.stringify(body) }));

beforeEach(async () => {
  mockIsSignupRefused.mockReset();
  mockIsSignupRefused.mockResolvedValue(false);
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  ({ playerId } = await repos.roster.players.create({ name: 'Rock', currentWrestler: 'The Rock', psnId: 'Rock_PSN' }));
  await repos.roster.players.update(playerId, { userId: SUB });
  await repos.roster.players.updateDiscipline(playerId, {
    strikes: [{
      strikeId: 's1',
      issuedAt: new Date().toISOString(),
      issuedBy: 'admin-sub',
      issuedByName: 'Admin',
      reason: 'Late',
    }],
    deactivations: [],
    deactivatedAt: null,
    signupGuardKey: 'rock@example.com',
  }, 0);
});

afterEach(() => {
  resetRepositoriesForTesting();
});

describe('GET /players/me', () => {
  it('gives the summary and no stored fields', async () => {
    const { statusCode, body } = await call<Record<string, unknown>>(getMyProfile, authedEvent(SUB, 'Wrestler'));

    expect(statusCode).toBe(200);
    for (const field of STORED_FIELDS) expect(body).not.toHaveProperty(field);
    expect(body).toMatchObject({ playerId, userId: SUB, discipline: { status: 'warned', activeStrikeCount: 1 } });
    expect(JSON.stringify(body)).not.toContain('admin-sub');
  });
});

describe('PUT /players/me', () => {
  it('gives the summary and no stored fields', async () => {
    const { statusCode, body } = await update({ name: 'Rocky' });

    expect(statusCode).toBe(200);
    for (const field of STORED_FIELDS) expect(body).not.toHaveProperty(field);
    expect(body).toMatchObject({ name: 'Rocky', discipline: { status: 'warned' } });
  });

  it('shapes the row on the wrestler assignment path too', async () => {
    const { wrestlerId } = await repos.roster.wrestlers.create({ name: 'Stone Cold' } as Parameters<Repositories['roster']['wrestlers']['create']>[0]);

    const { statusCode, body } = await update({ currentWrestlerId: wrestlerId });

    expect(statusCode).toBe(200);
    for (const field of STORED_FIELDS) expect(body).not.toHaveProperty(field);
    expect(body).toMatchObject({ discipline: { status: 'warned' } });
  });

  it('refuses a PSN ID held by someone blocked, and writes nothing', async () => {
    mockIsSignupRefused.mockResolvedValue(true);

    const { statusCode, body } = await update({ psnId: 'taken_psn' });

    expect(statusCode).toBe(409);
    expect(body.code).toBe('PSN_ID_UNAVAILABLE');
    expect(mockIsSignupRefused).toHaveBeenCalledWith({ psnId: 'taken_psn', excludePlayerId: playerId });
    expect((await repos.roster.players.findById(playerId))?.psnId).toBe('Rock_PSN');
  });

  it('allows a free PSN ID', async () => {
    const { statusCode } = await update({ psnId: 'free_psn' });

    expect(statusCode).toBe(200);
    expect((await repos.roster.players.findById(playerId))?.psnId).toBe('free_psn');
  });

  it.each([
    ['unchanged', 'Rock_PSN'],
    ['changed only in case and spacing', ' rock_psn '],
    ['blank', ''],
  ])('does not look up a PSN ID that is %s', async (_label, psnId) => {
    await update({ psnId, name: 'Rocky' });

    expect(mockIsSignupRefused).not.toHaveBeenCalled();
  });

  it('does not look up when the PSN ID is not sent', async () => {
    await update({ name: 'Rocky' });

    expect(mockIsSignupRefused).not.toHaveBeenCalled();
  });

  describe('while the caller is blocked from signing up', () => {
    const block = async (fields: { psnId?: string } = {}) => {
      const row = await repos.roster.players.findById(playerId);
      if (fields.psnId !== undefined) await repos.roster.players.update(playerId, fields);
      const second = { ...row!.strikes![0], strikeId: 's2' };
      await repos.roster.players.updateDiscipline(playerId, {
        strikes: [...row!.strikes!, second],
        deactivations: [],
        deactivatedAt: null,
      }, 1);
    };

    it.each([
      ['a different ID', 'other_psn'],
      ['nothing', ''],
    ])('refuses moving the PSN ID to %s, and writes nothing', async (_label, psnId) => {
      await block();

      const { statusCode, body } = await update({ psnId, name: 'Rocky' });

      expect(statusCode).toBe(403);
      expect(body.code).toBe('PSN_ID_LOCKED');
      const row = await repos.roster.players.findById(playerId);
      expect(row?.psnId).toBe('Rock_PSN');
      expect(row?.name).toBe('Rock');
    });

    it.each([
      ['unchanged', 'Rock_PSN'],
      ['changed only in case and spacing', ' rock_psn '],
    ])('allows a save with the PSN ID %s', async (_label, psnId) => {
      await block();

      expect((await update({ psnId, name: 'Rocky' })).statusCode).toBe(200);
    });

    it('allows saves that leave the PSN ID out', async () => {
      await block();

      expect((await update({ name: 'Rocky' })).statusCode).toBe(200);
    });

    it('lets a player with no PSN ID add one, which the guard then covers', async () => {
      await block({ psnId: '' });

      expect((await update({ psnId: 'first_psn' })).statusCode).toBe(200);
    });
  });
});
