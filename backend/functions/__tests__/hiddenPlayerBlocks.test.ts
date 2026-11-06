import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
vi.mock('../../lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));

import { buildInMemoryRepositories } from '../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../lib/repositories';
import { handler as joinQueue } from '../matchmaking/joinQueue';
import { handler as createInvitation } from '../matchmaking/createInvitation';
import { handler as createChallenge } from '../challenges/createChallenge';
import { handler as respondToChallenge } from '../challenges/respondToChallenge';
import { handler as createPromo } from '../promos/createPromo';
import { authedEvent, call, seedRoster, type RosterSeed } from './visibilityTestHelpers';

const promoContent = 'x'.repeat(60);
const TARGET_MESSAGE = 'That player has not set a wrestler name yet';

interface Message {
  message?: string;
}

let repos: Repositories;
let roster: RosterSeed;

const post = (sub: string, body: Record<string, unknown>) =>
  authedEvent(sub, 'Wrestler', { httpMethod: 'POST', body: JSON.stringify(body) });

async function appearOnline(playerId: string): Promise<void> {
  await repos.leagueOps.matchmaking.putPresence({
    playerId,
    lastSeenAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 600,
  });
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  roster = await seedRoster(repos);
  await repos.roster.players.update(roster.visibleId, { userId: 'visible-sub' });
  await repos.roster.players.update(roster.placeholderId, { userId: 'hidden-sub' });
});

afterEach(() => resetRepositoriesForTesting());

describe('joinQueue', () => {
  it('blocks a hidden player with a clear message', async () => {
    await appearOnline(roster.placeholderId);
    const { statusCode, body } = await call<Message>(joinQueue, post('hidden-sub', {}));
    expect(statusCode).toBe(400);
    expect(body.message).toBe('Set your wrestler name first');
    expect(await repos.leagueOps.matchmaking.listQueue()).toEqual([]);
  });

  it('lets a visible player join', async () => {
    await appearOnline(roster.visibleId);
    const { statusCode } = await call(joinQueue, post('visible-sub', {}));
    expect(statusCode).toBe(200);
  });
});

describe('createInvitation', () => {
  it('blocks inviting a hidden player', async () => {
    await appearOnline(roster.visibleId);
    await appearOnline(roster.placeholderId);
    const { statusCode, body } = await call<Message>(
      createInvitation,
      post('visible-sub', { targetPlayerId: roster.placeholderId }),
    );
    expect(statusCode).toBe(400);
    expect(body.message).toBe(TARGET_MESSAGE);
  });
});

describe('createChallenge', () => {
  it.each(['placeholderId', 'blankId'] as const)('blocks challenging %s', async (key) => {
    const { statusCode, body } = await call<Message>(
      createChallenge,
      post('visible-sub', { challengedId: roster[key], matchType: 'singles' }),
    );
    expect(statusCode).toBe(400);
    expect(body.message).toBe(TARGET_MESSAGE);
    expect(await repos.user.challenges.list()).toEqual([]);
  });

  it('allows challenging a visible player', async () => {
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    const { statusCode } = await call(
      createChallenge,
      post('visible-sub', { challengedId: rival.playerId, matchType: 'singles' }),
    );
    expect(statusCode).toBe(201);
  });

  it('blocks a hidden player from issuing a challenge', async () => {
    const { statusCode, body } = await call<Message>(
      createChallenge,
      post('hidden-sub', { challengedId: roster.visibleId, matchType: 'singles' }),
    );
    expect(statusCode).toBe(400);
    expect(body.message).toBe('Set your wrestler name first');
    expect(await repos.user.challenges.list()).toEqual([]);
  });

  it('blocks a hidden player from issuing a tag team challenge', async () => {
    const partner = await repos.roster.players.create({ name: 'P', currentWrestler: 'Taker' });
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    await repos.roster.tagTeams.create({
      name: 'Hidden Team',
      player1Id: roster.placeholderId,
      player2Id: partner.playerId,
      status: 'active',
    });
    const target = await repos.roster.tagTeams.create({
      name: 'Target Team',
      player1Id: roster.visibleId,
      player2Id: rival.playerId,
      status: 'active',
    });

    const { statusCode, body } = await call<Message>(
      createChallenge,
      post('hidden-sub', {
        challengeMode: 'tag_team',
        challengedTagTeamId: target.tagTeamId,
        matchType: 'tag',
      }),
    );

    expect(statusCode).toBe(400);
    expect(body.message).toBe('Set your wrestler name first');
    expect(await repos.user.challenges.list()).toEqual([]);
  });

  it('blocks challenging a tag team with a hidden member', async () => {
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    const partner = await repos.roster.players.create({ name: 'P', currentWrestler: 'Taker' });
    await repos.roster.tagTeams.create({
      name: 'Own Team',
      player1Id: roster.visibleId,
      player2Id: partner.playerId,
      status: 'active',
    });
    const target = await repos.roster.tagTeams.create({
      name: 'Target Team',
      player1Id: rival.playerId,
      player2Id: roster.placeholderId,
      status: 'active',
    });

    const { statusCode, body } = await call<Message>(
      createChallenge,
      post('visible-sub', {
        challengeMode: 'tag_team',
        challengedTagTeamId: target.tagTeamId,
        matchType: 'tag',
      }),
    );

    expect(statusCode).toBe(400);
    expect(body.message).toContain('has not set a wrestler name');
  });
});

describe('respondToChallenge counter', () => {
  it('blocks countering back at a challenger who is now hidden', async () => {
    const challenge = await repos.user.challenges.create({
      challengerId: roster.placeholderId,
      challengedId: roster.visibleId,
      matchType: 'singles',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const { statusCode, body } = await call<Message>(
      respondToChallenge,
      authedEvent('visible-sub', 'Wrestler', {
        pathParameters: { challengeId: challenge.challengeId },
        body: JSON.stringify({ action: 'counter', counterMatchType: 'ladder' }),
      }),
    );

    expect(statusCode).toBe(400);
    expect(body.message).toBe(TARGET_MESSAGE);
  });
});

describe('createPromo', () => {
  const promoBody = (promoType: string, extra: Record<string, unknown> = {}) => ({
    promoType,
    content: promoContent,
    ...extra,
  });

  it('blocks calling out a hidden player', async () => {
    const { statusCode, body } = await call<Message>(
      createPromo,
      post('visible-sub', promoBody('call-out', { targetPlayerId: roster.placeholderId })),
    );
    expect(statusCode).toBe(400);
    expect(body.message).toBe(TARGET_MESSAGE);
    expect(await repos.content.promos.list()).toEqual([]);
  });

  it('allows calling out a visible player', async () => {
    const rival = await repos.roster.players.create({ name: 'R', currentWrestler: 'Kane' });
    const { statusCode } = await call(
      createPromo,
      post('visible-sub', promoBody('call-out', { targetPlayerId: rival.playerId })),
    );
    expect(statusCode).toBe(201);
  });

  it.each(['open-mic', 'call-out'])('blocks a hidden player from cutting a %s promo', async (promoType) => {
    const { statusCode, body } = await call<Message>(
      createPromo,
      post('hidden-sub', promoBody(promoType, { targetPlayerId: roster.visibleId })),
    );
    expect(statusCode).toBe(400);
    expect(body.message).toBe('Set your wrestler name first');
    expect(await repos.content.promos.list()).toEqual([]);
  });

  it('still allows a response in a thread started by a now-hidden player', async () => {
    const thread = await repos.content.promos.create({
      playerId: roster.placeholderId,
      promoType: 'open-mic',
      content: promoContent,
    });
    const { statusCode } = await call(
      createPromo,
      post(
        'visible-sub',
        promoBody('response', {
          targetPlayerId: roster.placeholderId,
          targetPromoId: thread.promoId,
        }),
      ),
    );
    expect(statusCode).toBe(201);
  });
});
