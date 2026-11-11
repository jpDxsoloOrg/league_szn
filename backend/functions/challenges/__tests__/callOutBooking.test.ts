import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});

vi.mock('../../../lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));

import { buildInMemoryRepositories } from '../../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../../lib/repositories';
import { handler as createChallenge } from '../createChallenge';
import { handler as respondToChallenge } from '../respondToChallenge';
import { handler as scheduleMatch } from '../../matches/scheduleMatch';

const ctx = {} as Context;
const cb: Callback = () => {};

let repos: Repositories;
let challengerId: string;
let targetId: string;
let championshipId: string;
let promoId: string;

function wrestlerEvent(sub: string, overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    body: null, headers: {}, multiValueHeaders: {}, httpMethod: 'POST', isBase64Encoded: false,
    path: '/', pathParameters: null, queryStringParameters: null, multiValueQueryStringParameters: null,
    stageVariables: null, resource: '',
    requestContext: { authorizer: { groups: 'Wrestler', username: sub, principalId: sub } } as unknown as APIGatewayProxyEvent['requestContext'],
    ...overrides,
  };
}

async function addPlayer(name: string, userId: string): Promise<string> {
  const player = await repos.roster.players.create({ name, currentWrestler: name });
  await repos.roster.players.update(player.playerId, { userId });
  return player.playerId;
}

async function issueChallenge(body: Record<string, unknown> = {}) {
  const result = await createChallenge(wrestlerEvent('user-1', {
    body: JSON.stringify({ challengedId: targetId, matchType: 'Singles', championshipId, promoId, ...body }),
  }), ctx, cb);
  return result as { statusCode: number; body: string };
}

async function bookFromPromo() {
  const result = await scheduleMatch(wrestlerEvent('staff', {
    body: JSON.stringify({
      matchFormat: 'Singles', participants: [challengerId, targetId],
      isChampionship: true, championshipId, promoId,
    }),
  }), ctx, cb);
  return result as { statusCode: number; body: string };
}

describe('booking a call-out from its promo', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    repos = buildInMemoryRepositories();
    setRepositoriesForTesting(repos);
    challengerId = await addPlayer('Challenger', 'user-1');
    targetId = await addPlayer('Target', 'user-2');
    const title = await repos.competition.championships.create({
      name: 'World Title', type: 'singles', currentChampion: targetId,
    });
    championshipId = title.championshipId;
    const promo = await repos.content.promos.create({
      playerId: challengerId, promoType: 'call-out', content: 'x'.repeat(60),
      targetPlayerId: targetId, championshipId,
    });
    promoId = promo.promoId;
  });

  afterEach(() => {
    resetRepositoriesForTesting();
    vi.restoreAllMocks();
  });

  it('links the promo and challenge to each other when the challenge is issued', async () => {
    const result = await issueChallenge();

    expect(result.statusCode).toBe(201);
    const challenge = JSON.parse(result.body);
    expect(challenge.promoId).toBe(promoId);
    expect((await repos.content.promos.findById(promoId))?.challengeId).toBe(challenge.challengeId);
  });

  it('links a tag team challenge too', async () => {
    const partner = await addPlayer('Partner', 'user-3');
    const rival = await addPlayer('Rival', 'user-4');
    const ours = await repos.roster.tagTeams.create({ name: 'Ours', player1Id: challengerId, player2Id: partner });
    const theirs = await repos.roster.tagTeams.create({ name: 'Theirs', player1Id: targetId, player2Id: rival });
    await repos.roster.tagTeams.update(ours.tagTeamId, { status: 'active' });
    await repos.roster.tagTeams.update(theirs.tagTeamId, { status: 'active' });

    const result = await issueChallenge({
      challengeMode: 'tag_team', challengedTagTeamId: theirs.tagTeamId, matchType: 'Tag Team', championshipId: undefined,
    });

    expect(result.statusCode).toBe(201);
    const challenge = JSON.parse(result.body);
    expect((await repos.content.promos.findById(promoId))?.challengeId).toBe(challenge.challengeId);
  });

  it('refuses to link a promo the challenger did not write', async () => {
    const stranger = await repos.content.promos.create({
      playerId: targetId, promoType: 'call-out', content: 'x'.repeat(60),
    });

    const result = await issueChallenge({ promoId: stranger.promoId });

    expect(result.statusCode).toBe(400);
    expect(await repos.user.challenges.list()).toEqual([]);
  });

  it('still issues the challenge when writing the link to the promo fails', async () => {
    vi.spyOn(repos.content.promos, 'update').mockRejectedValue(new Error('write failed'));

    expect((await issueChallenge()).statusCode).toBe(201);
  });

  it('closes the challenge and refuses a second booking of the same call-out', async () => {
    const challenge = JSON.parse((await issueChallenge()).body);

    const first = await bookFromPromo();
    expect(first.statusCode).toBe(201);
    const match = JSON.parse(first.body);

    expect(await repos.user.challenges.findById(challenge.challengeId)).toMatchObject({
      status: 'scheduled', matchId: match.matchId,
    });
    expect((await bookFromPromo()).statusCode).toBe(400);
    expect(await repos.competition.matches.list()).toHaveLength(1);
  });

  it('carries the promo link onto a counter, so booking the counter hides the promo', async () => {
    const challenge = JSON.parse((await issueChallenge()).body);

    const countered = await respondToChallenge(wrestlerEvent('user-2', {
      pathParameters: { challengeId: challenge.challengeId },
      body: JSON.stringify({ action: 'counter', counterMatchType: 'Singles' }),
    }), ctx, cb);
    const { counter } = JSON.parse((countered as { body: string }).body);
    expect(counter.promoId).toBe(promoId);

    await scheduleMatch(wrestlerEvent('staff', {
      body: JSON.stringify({
        matchFormat: 'Singles', participants: [challengerId, targetId],
        isChampionship: true, championshipId, challengeId: counter.challengeId,
      }),
    }), ctx, cb);

    expect((await repos.content.promos.findById(promoId))?.isHidden).toBe(true);
    expect((await bookFromPromo()).statusCode).toBe(400);
  });
});
