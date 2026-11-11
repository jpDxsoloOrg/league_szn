import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
vi.mock('../../lib/authenticate', async () => {
  const { fakeAuthenticate } = await import('./visibilityTestHelpers');
  return { authenticate: fakeAuthenticate };
});

import { buildInMemoryRepositories } from '../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../lib/repositories';
import type { Challenge } from '../../lib/repositories/types';
import { handler as getChallenges } from '../challenges/getChallenges';
import { bearer, call, makeEvent } from './visibilityTestHelpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

let repos: Repositories;
let challengerId: string;
let challengedId: string;

async function addPlayer(name: string, userId: string): Promise<string> {
  const { playerId } = await repos.roster.players.create({ name, currentWrestler: `${name} Wrestler` });
  await repos.roster.players.update(playerId, { userId });
  return playerId;
}

/** A challenge issued `ageDays` ago with the given stored status. */
async function addChallenge(
  ageDays: number,
  status: Challenge['status'],
  extra: Partial<Challenge> = {},
): Promise<string> {
  const { challengeId } = await repos.user.challenges.create({
    challengerId,
    challengedId,
    matchType: 'singles',
    expiresAt: daysFromNow(4 - ageDays),
  });
  await repos.user.challenges.update(challengeId, {
    status,
    createdAt: daysFromNow(-ageDays),
    ...extra,
  });
  return challengeId;
}

async function listedIds(
  auth: Partial<APIGatewayProxyEvent> = {},
  query: Record<string, string> | null = null,
): Promise<string[]> {
  const { statusCode, body } = await call<Array<{ challengeId: string }>>(
    getChallenges,
    makeEvent({ ...auth, queryStringParameters: query }),
  );
  expect(statusCode).toBe(200);
  return body.map((row) => row.challengeId).sort();
}

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  challengerId = await addPlayer('Challenger', 'challenger-sub');
  challengedId = await addPlayer('Challenged', 'challenged-sub');
  await addPlayer('Bystander', 'bystander-sub');
});

afterEach(() => resetRepositoriesForTesting());

describe('GET /challenges lapsed rows', () => {
  it('drops expired and overdue pending rows from the public list', async () => {
    const open = await addChallenge(1, 'pending');
    await addChallenge(30, 'expired');
    await addChallenge(5, 'pending');

    expect(await listedIds()).toEqual([open]);
  });

  it('keeps answered challenges however old they are', async () => {
    const accepted = await addChallenge(30, 'accepted');
    const declined = await addChallenge(30, 'declined');

    expect(await listedIds()).toEqual([accepted, declined].sort());
  });

  it('applies to the status and player filters too', async () => {
    await addChallenge(30, 'expired');
    await addChallenge(5, 'pending');

    expect(await listedIds({}, { status: 'expired' })).toEqual([]);
    expect(await listedIds({}, { status: 'pending' })).toEqual([]);
    expect(await listedIds({}, { playerId: challengerId })).toEqual([]);
  });

  it('hides them from a signed-in player who is not involved', async () => {
    await addChallenge(30, 'expired');

    expect(await listedIds(bearer('bystander-sub', 'Wrestler'))).toEqual([]);
  });

  it('falls back to the public view for a token that fails verification', async () => {
    await addChallenge(30, 'expired');

    expect(await listedIds({ headers: { Authorization: 'Bearer invalid' } })).toEqual([]);
  });

  it('keeps them for staff', async () => {
    const expired = await addChallenge(30, 'expired');

    expect(await listedIds(bearer('staff-sub', 'Moderator'))).toEqual([expired]);
    expect(await listedIds(bearer('admin-sub', 'Admin'))).toEqual([expired]);
  });

  it('keeps them for both participants', async () => {
    const expired = await addChallenge(30, 'expired');

    expect(await listedIds(bearer('challenger-sub', 'Wrestler'))).toEqual([expired]);
    expect(await listedIds(bearer('challenged-sub', 'Wrestler'))).toEqual([expired]);
  });

  it('keeps them for a tag team partner named on neither side of the row', async () => {
    const partnerId = await addPlayer('Partner', 'partner-sub');
    const team = await repos.roster.tagTeams.create({
      name: 'Team',
      player1Id: challengedId,
      player2Id: partnerId,
      status: 'active',
    });
    const expired = await addChallenge(30, 'expired', {
      challengeMode: 'tag_team',
      challengedTagTeamId: team.tagTeamId,
    });

    expect(await listedIds(bearer('partner-sub', 'Wrestler'))).toEqual([expired]);
    expect(await listedIds(bearer('bystander-sub', 'Wrestler'))).toEqual([]);
  });
});
