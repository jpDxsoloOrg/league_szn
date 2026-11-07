import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

vi.mock('uuid', async () => {
  const { randomUUID } = await import('node:crypto');
  return { v4: () => randomUUID() };
});
vi.mock('../../lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../lib/services/recalculateContenderRankings', () => ({
  recalculateContenderRankings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../lib/services/recomputeRivalryHeat', () => ({
  recomputeRivalryHeat: vi.fn().mockResolvedValue(undefined),
}));

import { buildInMemoryRepositories } from '../../lib/repositories/inMemory';
import {
  setRepositoriesForTesting,
  resetRepositoriesForTesting,
  type Repositories,
} from '../../lib/repositories';
import type { PlayerStrike } from '../../lib/repositories/types';
import { handler as checkIn } from '../events/checkIn';
import { handler as deleteCheckIn } from '../events/deleteCheckIn';
import { handler as getCheckIns } from '../events/getCheckIns';
import { handler as getCheckInSummary } from '../events/getCheckInSummary';
import { handler as getEvent } from '../events/getEvent';
import { handler as claimSlot } from '../matches/claimSlot';
import { handler as releaseSlot } from '../matches/releaseSlot';
import { handler as scheduleMatch } from '../matches/scheduleMatch';
import { handler as adminUpdateSlot } from '../matches/adminUpdateSlot';
import { handler as updateMatch } from '../matches/updateMatch';
import { handler as recordResult } from '../matches/recordResult';
import { hydrateMatchSlots } from '../matches/hydrateSlots';
import { handler as heartbeat } from '../matchmaking/heartbeat';
import { handler as joinQueue } from '../matchmaking/joinQueue';
import { handler as createInvitation } from '../matchmaking/createInvitation';
import { handler as acceptInvitation } from '../matchmaking/acceptInvitation';
import { handler as getQueue } from '../matchmaking/getQueue';
import { handler as getOnline } from '../matchmaking/getOnline';
import { handler as createChallenge } from '../challenges/createChallenge';
import { handler as respondToChallenge } from '../challenges/respondToChallenge';
import { handler as createPromo } from '../promos/createPromo';
import { handler as createTournament } from '../tournaments/createTournament';
import { handler as assignChampion } from '../championships/assignChampion';
import { handler as updateChampionship } from '../championships/updateChampionship';
import { handler as createChampionship } from '../championships/createChampionship';
import { handler as createRivalry } from '../rivalries/createRivalry';
import { handler as setOverride } from '../contenders/setOverride';
import { handler as createTagTeam } from '../tagTeams/createTagTeam';
import { handler as approveTagTeam } from '../tagTeams/approveTagTeam';
import { handler as inviteToStable } from '../stables/inviteToStable';
import { handler as reactivateStable } from '../stables/reactivateStable';
import { handler as approveStable } from '../stables/approveStable';
import { handler as getPlayers } from '../players/getPlayers';
import { handler as deletePlayer } from '../players/deletePlayer';
import { authedEvent, call, makeEvent } from './visibilityTestHelpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const ctx = {} as Context;
const noCallback = () => {};
const promoContent = 'x'.repeat(60);
const FUTURE = new Date(Date.now() + 30 * DAY_MS).toISOString();

type DisciplineState = 'blocked' | 'deactivated';

interface Refusal {
  message?: string;
  code?: string;
  blockedUntil?: string;
}

let repos: Repositories;
let callerId: string;
let rivalId: string;

const strike = (daysAgo: number): PlayerStrike => ({
  strikeId: `strike-${daysAgo}`,
  issuedAt: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
  issuedBy: 'admin-sub',
  issuedByName: 'Admin',
  reason: 'Missed the show',
});

async function setDiscipline(playerId: string, state: DisciplineState): Promise<void> {
  await repos.roster.players.updateDiscipline(playerId, {
    strikes: [strike(3), strike(1)],
    deactivations: [],
    deactivatedAt: state === 'deactivated' ? new Date().toISOString() : null,
  }, 0);
}

const addPlayer = async (name: string, wrestler: string, userId?: string): Promise<string> => {
  const { playerId } = await repos.roster.players.create({ name, currentWrestler: wrestler });
  if (userId) await repos.roster.players.update(playerId, { userId });
  return playerId;
};

const member = (sub: string, overrides: Partial<APIGatewayProxyEvent> = {}) =>
  authedEvent(sub, 'Wrestler', { httpMethod: 'POST', ...overrides });
const memberPost = (sub: string, body: Record<string, unknown>, pathParameters: Record<string, string> | null = null) =>
  member(sub, { body: JSON.stringify(body), pathParameters });
const staffPost = (body: Record<string, unknown>, pathParameters: Record<string, string> | null = null) =>
  authedEvent('admin-sub', 'Admin', { httpMethod: 'POST', body: JSON.stringify(body), pathParameters });

const expectCallerRefused = (result: { statusCode: number; body: Refusal }, state: DisciplineState): void => {
  expect(result.statusCode).toBe(403);
  if (state === 'blocked') {
    expect(result.body.code).toBe('SIGNUP_BLOCKED');
    expect(result.body.blockedUntil).toEqual(expect.any(String));
  } else {
    expect(result.body.code).toBe('PLAYER_DEACTIVATED');
  }
};

const expectUnavailable = (result: { statusCode: number; body: Refusal }): void => {
  expect(result.statusCode).toBe(409);
  expect(result.body.code).toBe('PLAYER_UNAVAILABLE');
  expect(result.body.message).not.toMatch(/deactivat|block|suspend|strike/i);
};

const expectDeactivatedRefusal = (result: { statusCode: number; body: Refusal }): void => {
  expect(result.statusCode).toBe(409);
  expect(result.body.code).toBe('PLAYER_DEACTIVATED');
};

async function appearOnline(playerId: string): Promise<void> {
  await repos.leagueOps.matchmaking.putPresence({
    playerId,
    lastSeenAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 600,
  });
}

async function addEvent(): Promise<string> {
  const { eventId } = await repos.leagueOps.events.create({ name: 'Raw', eventType: 'weekly', date: FUTURE });
  await repos.leagueOps.events.update(eventId, { status: 'upcoming' });
  return eventId;
}

async function addSlotMatch(slotPlayerIds: Array<string | undefined>): Promise<string> {
  const matchId = `match-${Math.random()}`;
  const now = new Date().toISOString();
  const slots = slotPlayerIds.map((playerId, index) => ({
    slotId: `slot-${index + 1}`,
    position: index + 1,
    ...(playerId ? { playerId } : {}),
  }));
  await repos.competition.matches.create({
    matchId,
    date: now,
    matchFormat: 'singles',
    participants: slotPlayerIds.filter((id) => id !== undefined),
    slots,
    slotsRequired: slots.length,
    isChampionship: false,
    status: 'open-signups',
    createdAt: now,
    updatedAt: now,
  });
  return matchId;
}

async function addScheduledMatch(participants: string[], teams?: string[][]): Promise<string> {
  const matchId = `match-${Math.random()}`;
  const now = new Date().toISOString();
  await repos.competition.matches.create({
    matchId,
    date: now,
    matchFormat: 'singles',
    participants,
    ...(teams ? { teams } : {}),
    isChampionship: false,
    status: 'scheduled',
    createdAt: now,
    updatedAt: now,
  });
  return matchId;
}

async function addInvitation(fromPlayerId: string, toPlayerId: string): Promise<string> {
  const invitationId = `inv-${Math.random()}`;
  await repos.leagueOps.matchmaking.putInvitation({
    invitationId,
    fromPlayerId,
    toPlayerId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: FUTURE,
    ttl: Math.floor(Date.now() / 1000) + 600,
  });
  return invitationId;
}

async function addTournament(participants: string[]): Promise<string> {
  const tournamentId = `tournament-${Math.random()}`;
  await repos.competition.tournaments.create({
    tournamentId,
    name: 'G1',
    type: 'round-robin',
    status: 'in-progress',
    participants,
    standings: Object.fromEntries(participants.map((id) => [id, { wins: 0, losses: 0, draws: 0, points: 0 }])),
  });
  return tournamentId;
}

const addTeam = async (player1Id: string, player2Id: string, name = 'Team'): Promise<string> =>
  (await repos.roster.tagTeams.create({ name, player1Id, player2Id, status: 'active' })).tagTeamId;

const addChallenge = async (challengerId: string, challengedId: string): Promise<string> =>
  (await repos.user.challenges.create({ challengerId, challengedId, matchType: 'singles', expiresAt: FUTURE })).challengeId;

beforeEach(async () => {
  repos = buildInMemoryRepositories();
  setRepositoriesForTesting(repos);
  callerId = await addPlayer('Caller', 'The Rock', 'caller-sub');
  rivalId = await addPlayer('Rival', 'Kane', 'rival-sub');
});

afterEach(() => resetRepositoriesForTesting());

describe.each<DisciplineState>(['blocked', 'deactivated'])('member actions by a %s caller', (state) => {
  beforeEach(() => setDiscipline(callerId, state));

  it.each(['available', 'tentative'])('refuses a check-in as %s', async (status) => {
    const eventId = await addEvent();
    const result = await call<Refusal>(checkIn, memberPost('caller-sub', { status }, { eventId }));
    expectCallerRefused(result, state);
    expect(await repos.leagueOps.events.listCheckIns(eventId)).toEqual([]);
  });

  it('leaves check-in as unavailable open', async () => {
    const eventId = await addEvent();
    const { statusCode } = await call(checkIn, memberPost('caller-sub', { status: 'unavailable' }, { eventId }));
    expect(statusCode).toBe(200);
  });

  it('refuses claiming a slot', async () => {
    const matchId = await addSlotMatch([undefined, undefined]);
    const result = await call<Refusal>(claimSlot, member('caller-sub', { pathParameters: { matchId, slotId: 'slot-1' } }));
    expectCallerRefused(result, state);
  });

  it('refuses a heartbeat and writes no presence', async () => {
    const result = await call<Refusal>(heartbeat, member('caller-sub'));
    expectCallerRefused(result, state);
    expect(await repos.leagueOps.matchmaking.getPresence(callerId)).toBeNull();
  });

  it('refuses joining the queue', async () => {
    await appearOnline(callerId);
    const result = await call<Refusal>(joinQueue, memberPost('caller-sub', {}));
    expectCallerRefused(result, state);
    expect(await repos.leagueOps.matchmaking.listQueue()).toEqual([]);
  });

  it('refuses sending an invitation', async () => {
    await appearOnline(callerId);
    await appearOnline(rivalId);
    const result = await call<Refusal>(createInvitation, memberPost('caller-sub', { targetPlayerId: rivalId }));
    expectCallerRefused(result, state);
  });

  it('refuses accepting an invitation and writes nothing', async () => {
    const invitationId = await addInvitation(rivalId, callerId);
    const result = await call<Refusal>(acceptInvitation, member('caller-sub', { pathParameters: { invitationId } }));
    expectCallerRefused(result, state);
    expect((await repos.leagueOps.matchmaking.getInvitation(invitationId))?.status).toBe('pending');
    expect(await repos.competition.matches.list()).toEqual([]);
  });

  it('refuses issuing a challenge', async () => {
    const result = await call<Refusal>(
      createChallenge,
      memberPost('caller-sub', { challengedId: rivalId, matchType: 'singles' }),
    );
    expectCallerRefused(result, state);
    expect(await repos.user.challenges.list()).toEqual([]);
  });

  it('refuses accepting a challenge without writing', async () => {
    const challengeId = await addChallenge(rivalId, callerId);
    const update = vi.spyOn(repos.user.challenges, 'update');
    const updateIfStatus = vi.spyOn(repos.user.challenges, 'updateIfStatus');
    const result = await call<Refusal>(
      respondToChallenge,
      memberPost('caller-sub', { action: 'accept' }, { challengeId }),
    );
    expectCallerRefused(result, state);
    expect(update).not.toHaveBeenCalled();
    expect(updateIfStatus).not.toHaveBeenCalled();
    expect((await repos.user.challenges.findById(challengeId))?.status).toBe('pending');
  });

  it('refuses countering a challenge', async () => {
    const challengeId = await addChallenge(rivalId, callerId);
    const result = await call<Refusal>(
      respondToChallenge,
      memberPost('caller-sub', { action: 'counter', counterMatchType: 'singles' }, { challengeId }),
    );
    expectCallerRefused(result, state);
    expect((await repos.user.challenges.list())).toHaveLength(1);
  });

  it('leaves declining a challenge open', async () => {
    const challengeId = await addChallenge(rivalId, callerId);
    const { statusCode } = await call(
      respondToChallenge,
      memberPost('caller-sub', { action: 'decline' }, { challengeId }),
    );
    expect(statusCode).toBe(200);
    expect((await repos.user.challenges.findById(challengeId))?.status).toBe('declined');
  });

  it('refuses a call-out promo', async () => {
    const result = await call<Refusal>(createPromo, memberPost('caller-sub', {
      promoType: 'call-out',
      content: promoContent,
      targetPlayerId: rivalId,
    }));
    expectCallerRefused(result, state);
    expect(await repos.content.promos.list()).toEqual([]);
  });
});

describe('member actions a blocked caller keeps', () => {
  beforeEach(() => setDiscipline(callerId, 'blocked'));

  it('allows a promo that is not a call-out', async () => {
    const { statusCode } = await call(createPromo, memberPost('caller-sub', {
      promoType: 'open-mic',
      content: promoContent,
    }));
    expect(statusCode).toBe(201);
  });

  it('allows deleting a check-in', async () => {
    const eventId = await addEvent();
    await repos.leagueOps.events.upsertCheckIn(eventId, callerId, 'available');
    await deleteCheckIn(authedEvent('caller-sub', 'Wrestler', { httpMethod: 'DELETE', pathParameters: { eventId } }));
    expect(await repos.leagueOps.events.listCheckIns(eventId)).toEqual([]);
  });

  it('allows releasing a slot', async () => {
    const matchId = await addSlotMatch([callerId, undefined]);
    const { statusCode } = await call(
      releaseSlot,
      authedEvent('caller-sub', 'Wrestler', { httpMethod: 'DELETE', pathParameters: { matchId, slotId: 'slot-1' } }),
    );
    expect(statusCode).toBe(200);
  });
});

describe.each<DisciplineState>(['blocked', 'deactivated'])('member actions with a %s other party', (state) => {
  beforeEach(() => setDiscipline(rivalId, state));

  it('refuses inviting them, with the reason left out', async () => {
    await appearOnline(callerId);
    await appearOnline(rivalId);
    expectUnavailable(await call<Refusal>(createInvitation, memberPost('caller-sub', { targetPlayerId: rivalId })));
  });

  it('refuses accepting their invitation and writes nothing', async () => {
    const invitationId = await addInvitation(rivalId, callerId);
    expectUnavailable(await call<Refusal>(acceptInvitation, member('caller-sub', { pathParameters: { invitationId } })));
    expect((await repos.leagueOps.matchmaking.getInvitation(invitationId))?.status).toBe('pending');
    expect(await repos.competition.matches.list()).toEqual([]);
  });

  it('refuses challenging them', async () => {
    expectUnavailable(await call<Refusal>(
      createChallenge,
      memberPost('caller-sub', { challengedId: rivalId, matchType: 'singles' }),
    ));
    expect(await repos.user.challenges.list()).toEqual([]);
  });

  it('refuses accepting their challenge', async () => {
    const challengeId = await addChallenge(rivalId, callerId);
    expectUnavailable(await call<Refusal>(
      respondToChallenge,
      memberPost('caller-sub', { action: 'accept' }, { challengeId }),
    ));
    expect((await repos.user.challenges.findById(challengeId))?.status).toBe('pending');
  });

  it('refuses countering their challenge', async () => {
    const challengeId = await addChallenge(rivalId, callerId);
    expectUnavailable(await call<Refusal>(
      respondToChallenge,
      memberPost('caller-sub', { action: 'counter', counterMatchType: 'singles' }, { challengeId }),
    ));
  });

  it('refuses calling them out', async () => {
    expectUnavailable(await call<Refusal>(createPromo, memberPost('caller-sub', {
      promoType: 'call-out',
      content: promoContent,
      targetPlayerId: rivalId,
    })));
    expect(await repos.content.promos.list()).toEqual([]);
  });
});

describe('tag challenges', () => {
  let partnerId: string;
  let otherPartnerId: string;
  let ownTeam: string;
  let otherTeam: string;

  beforeEach(async () => {
    partnerId = await addPlayer('Partner', 'Taker');
    otherPartnerId = await addPlayer('Other', 'Sting');
    ownTeam = await addTeam(callerId, partnerId, 'Own');
    otherTeam = await addTeam(rivalId, otherPartnerId, 'Other');
  });

  const issue = () => call<Refusal>(createChallenge, memberPost('caller-sub', {
    challengeMode: 'tag_team',
    challengedTagTeamId: otherTeam,
    matchType: 'tag',
  }));

  const addTagChallenge = async (): Promise<string> => (await repos.user.challenges.create({
    challengerId: rivalId,
    challengedId: callerId,
    challengeMode: 'tag_team',
    challengerTagTeamId: otherTeam,
    challengedTagTeamId: ownTeam,
    matchType: 'tag',
    expiresAt: FUTURE,
  })).challengeId;

  it('refuses issuing with a blocked partner', async () => {
    await setDiscipline(partnerId, 'blocked');
    expectUnavailable(await issue());
    expect(await repos.user.challenges.list()).toEqual([]);
  });

  it('refuses issuing against a team with a blocked member', async () => {
    await setDiscipline(otherPartnerId, 'blocked');
    expectUnavailable(await issue());
  });

  it('allows issuing when all four are clear', async () => {
    expect((await issue()).statusCode).toBe(201);
  });

  it('refuses accepting with a blocked teammate on the responder side', async () => {
    await setDiscipline(partnerId, 'blocked');
    const challengeId = await addTagChallenge();
    expectUnavailable(await call<Refusal>(
      respondToChallenge,
      memberPost('caller-sub', { action: 'accept' }, { challengeId }),
    ));
  });

  it('refuses accepting with a blocked member on the challenger side', async () => {
    await setDiscipline(otherPartnerId, 'blocked');
    const challengeId = await addTagChallenge();
    expectUnavailable(await call<Refusal>(
      respondToChallenge,
      memberPost('caller-sub', { action: 'accept' }, { challengeId }),
    ));
  });

  describe('tag call-out promos', () => {
    const callOut = (extra: Record<string, unknown> = {}) => call<Refusal>(createPromo, memberPost('caller-sub', {
      promoType: 'call-out',
      content: promoContent,
      challengeMode: 'tag_team',
      challengerTagTeamName: 'Own',
      targetTagTeamName: 'Other',
      targetTagTeamId: otherTeam,
      ...extra,
    }));

    it.each(['blocked', 'deactivated'] as const)('refuses with a %s partner, and publishes nothing', async (state) => {
      await setDiscipline(partnerId, state);
      expectUnavailable(await callOut());
      expect(await repos.content.promos.list()).toEqual([]);
    });

    it.each(['blocked', 'deactivated'] as const)('refuses when the other team has a %s member', async (state) => {
      await setDiscipline(otherPartnerId, state);
      expectUnavailable(await callOut());
      expect(await repos.content.promos.list()).toEqual([]);
    });

    it('publishes when all four are clear', async () => {
      expect((await callOut()).statusCode).toBe(201);
    });

    it('keeps the team id off the stored promo', async () => {
      await callOut();
      const [promo] = await repos.content.promos.list();
      expect(promo).not.toHaveProperty('targetTagTeamId');
    });

    it('does not gate a promo that is not a call-out', async () => {
      await setDiscipline(otherPartnerId, 'blocked');
      expect((await callOut({ promoType: 'open-mic' })).statusCode).toBe(201);
    });
  });

  it('allows the responder to decline with a blocked teammate', async () => {
    await setDiscipline(partnerId, 'blocked');
    const challengeId = await addTagChallenge();
    const { statusCode } = await call(
      respondToChallenge,
      memberPost('caller-sub', { action: 'decline' }, { challengeId }),
    );
    expect(statusCode).toBe(200);
  });
});

describe('accepting a challenge that moved on', () => {
  it('cannot bring back a challenge cancelled between the read and the write', async () => {
    const challengeId = await addChallenge(rivalId, callerId);
    vi.spyOn(repos.user.challenges, 'updateIfStatus').mockImplementation(async () => {
      await repos.user.challenges.update(challengeId, { status: 'cancelled' });
      return false;
    });
    const { statusCode, body } = await call<Refusal>(
      respondToChallenge,
      memberPost('caller-sub', { action: 'accept' }, { challengeId }),
    );
    expect(statusCode).toBe(400);
    expect(body.message).toBe('Challenge is no longer pending');
    expect((await repos.user.challenges.findById(challengeId))?.status).toBe('cancelled');
  });
});

describe('scheduleMatch', () => {
  const book = (extra: Record<string, unknown> = {}) => call<Refusal>(scheduleMatch, staffPost({
    matchFormat: 'singles',
    participants: [callerId, rivalId],
    isChampionship: false,
    ...extra,
  }));

  it('refuses a deactivated participant', async () => {
    await setDiscipline(rivalId, 'deactivated');
    expectDeactivatedRefusal(await book());
    expect(await repos.competition.matches.list()).toEqual([]);
  });

  it('refuses a deactivated player in a filled slot', async () => {
    await setDiscipline(rivalId, 'deactivated');
    expectDeactivatedRefusal(await call<Refusal>(scheduleMatch, staffPost({
      matchFormat: 'singles',
      slotsRequired: 2,
      slots: [{ position: 1, playerId: rivalId }, { position: 2 }],
      isChampionship: false,
    })));
  });

  it('lets staff book a sign-up-blocked player', async () => {
    await setDiscipline(rivalId, 'blocked');
    expect((await book()).statusCode).toBe(201);
  });

  it('books a deactivated entrant into their own tournament, and nowhere else', async () => {
    await setDiscipline(rivalId, 'deactivated');
    const tournamentId = await addTournament([callerId, rivalId]);
    expect((await book({ tournamentId })).statusCode).toBe(201);
    expectDeactivatedRefusal(await book());
  });

  it('refuses a deactivated player who is not an entrant of the tournament named', async () => {
    await setDiscipline(rivalId, 'deactivated');
    const otherId = await addPlayer('Other', 'Sting');
    const tournamentId = await addTournament([callerId, otherId]);
    expectDeactivatedRefusal(await book({ tournamentId }));
  });
});

describe('a round robin with a deactivated entrant', () => {
  it('runs to completed by booking the match and recording a forfeit', async () => {
    await setDiscipline(rivalId, 'deactivated');
    const tournamentId = await addTournament([callerId, rivalId]);

    const booked = await call<{ matchId: string }>(scheduleMatch, staffPost({
      matchFormat: 'singles',
      participants: [callerId, rivalId],
      isChampionship: false,
      tournamentId,
    }));
    expect(booked.statusCode).toBe(201);

    const recorded = await call(recordResult, staffPost(
      { winners: [callerId], losers: [rivalId] },
      { matchId: booked.body.matchId },
    ));
    expect(recorded.statusCode).toBe(200);

    const tournament = await repos.competition.tournaments.findById(tournamentId);
    expect(tournament?.status).toBe('completed');
    expect(tournament?.winner).toBe(callerId);
  });
});

describe('recordResult', () => {
  it('records a held match with a deactivated participant', async () => {
    const matchId = await addScheduledMatch([callerId, rivalId]);
    await setDiscipline(rivalId, 'deactivated');
    const { statusCode } = await call(recordResult, staffPost({ winners: [callerId], losers: [rivalId] }, { matchId }));
    expect(statusCode).toBe(200);
    expect((await repos.roster.players.findById(rivalId))?.losses).toBe(1);
  });
});

describe('adminUpdateSlot', () => {
  const assign = (matchId: string, slotId: string, playerId: string) => call<Refusal>(adminUpdateSlot, authedEvent(
    'admin-sub',
    'Admin',
    { httpMethod: 'PUT', body: JSON.stringify({ playerId }), pathParameters: { matchId, slotId } },
  ));

  it('refuses assigning a deactivated player', async () => {
    await setDiscipline(rivalId, 'deactivated');
    const matchId = await addSlotMatch([undefined, undefined]);
    expectDeactivatedRefusal(await assign(matchId, 'slot-1', rivalId));
  });

  it('allows assigning a sign-up-blocked player', async () => {
    await setDiscipline(rivalId, 'blocked');
    const matchId = await addSlotMatch([undefined, undefined]);
    expect((await assign(matchId, 'slot-1', rivalId)).statusCode).toBe(200);
  });

  it('does not stop an edit of a slot already holding them', async () => {
    const matchId = await addSlotMatch([rivalId, undefined]);
    await setDiscipline(rivalId, 'deactivated');
    expect((await assign(matchId, 'slot-1', rivalId)).statusCode).toBe(200);
  });
});

describe('updateMatch', () => {
  const edit = (matchId: string, body: Record<string, unknown>) => call<Refusal>(updateMatch, authedEvent(
    'admin-sub',
    'Admin',
    { httpMethod: 'PUT', body: JSON.stringify(body), pathParameters: { matchId } },
  ));

  it('refuses swapping in a deactivated player', async () => {
    const otherId = await addPlayer('Other', 'Sting');
    const matchId = await addScheduledMatch([callerId, otherId]);
    await setDiscipline(rivalId, 'deactivated');
    expectDeactivatedRefusal(await edit(matchId, { participants: [callerId, rivalId] }));
  });

  it('refuses a deactivated player added through teams alone', async () => {
    const otherId = await addPlayer('Other', 'Sting');
    const matchId = await addScheduledMatch([callerId, otherId]);
    await setDiscipline(rivalId, 'deactivated');
    expectDeactivatedRefusal(await edit(matchId, { teams: [[callerId], [rivalId]] }));
  });

  it('allows editing a match already holding a deactivated player', async () => {
    const otherId = await addPlayer('Other', 'Sting');
    const matchId = await addScheduledMatch([callerId, rivalId], [[callerId], [rivalId]]);
    await setDiscipline(rivalId, 'deactivated');
    const result = await edit(matchId, {
      participants: [otherId, rivalId],
      teams: [[otherId], [rivalId]],
    });
    expect(result.statusCode).toBe(200);
  });

  it('allows swapping in a sign-up-blocked player', async () => {
    const otherId = await addPlayer('Other', 'Sting');
    const matchId = await addScheduledMatch([callerId, otherId]);
    await setDiscipline(rivalId, 'blocked');
    expect((await edit(matchId, { participants: [callerId, rivalId] })).statusCode).toBe(200);
  });
});

describe('createTournament', () => {
  const create = () => call<Refusal>(createTournament, staffPost({
    name: 'G1',
    type: 'round-robin',
    participants: [callerId, rivalId],
  }));

  it('refuses a deactivated entrant', async () => {
    await setDiscipline(rivalId, 'deactivated');
    expectDeactivatedRefusal(await create());
    expect(await repos.competition.tournaments.list()).toEqual([]);
  });

  it('allows a sign-up-blocked entrant', async () => {
    await setDiscipline(rivalId, 'blocked');
    expect((await create()).statusCode).toBe(201);
  });
});

describe('championships', () => {
  const addTitle = async (type: 'singles' | 'tag', currentChampion?: string | string[]): Promise<string> =>
    (await repos.competition.championships.create({ name: 'World', type, currentChampion })).championshipId;

  it('refuses assigning a deactivated champion', async () => {
    await setDiscipline(rivalId, 'deactivated');
    const championshipId = await addTitle('singles');
    expectDeactivatedRefusal(await call<Refusal>(
      assignChampion,
      staffPost({ champion: rivalId }, { championshipId }),
    ));
  });

  it('lets a deactivated co-holder stay when the other half of a tag title changes', async () => {
    const otherId = await addPlayer('Other', 'Sting');
    const championshipId = await addTitle('tag', [rivalId, otherId]);
    await setDiscipline(rivalId, 'deactivated');
    const { statusCode } = await call(
      assignChampion,
      staffPost({ champion: [rivalId, callerId] }, { championshipId }),
    );
    expect(statusCode).toBe(200);
  });

  it('refuses setting a deactivated champion directly', async () => {
    await setDiscipline(rivalId, 'deactivated');
    const championshipId = await addTitle('singles');
    expectDeactivatedRefusal(await call<Refusal>(updateChampionship, authedEvent('admin-sub', 'Admin', {
      httpMethod: 'PUT',
      body: JSON.stringify({ currentChampion: rivalId }),
      pathParameters: { championshipId },
    })));
    expect((await repos.competition.championships.findById(championshipId))?.currentChampion).toBeUndefined();
  });

  it('does not stop an update naming the deactivated holder again', async () => {
    const championshipId = await addTitle('singles', rivalId);
    await setDiscipline(rivalId, 'deactivated');
    const { statusCode } = await call(updateChampionship, authedEvent('admin-sub', 'Admin', {
      httpMethod: 'PUT',
      body: JSON.stringify({ currentChampion: rivalId, name: 'Renamed' }),
      pathParameters: { championshipId },
    }));
    expect(statusCode).toBe(200);
  });

  it('refuses creating a title held by a deactivated player', async () => {
    await setDiscipline(rivalId, 'deactivated');
    expectDeactivatedRefusal(await call<Refusal>(
      createChampionship,
      staffPost({ name: 'World', type: 'singles', currentChampion: rivalId }),
    ));
    expect(await repos.competition.championships.list()).toEqual([]);
  });
});

describe('createRivalry', () => {
  const create = () => call<Refusal>(createRivalry, staffPost({
    title: 'Feud',
    participants: [{ playerId: callerId }, { playerId: rivalId }],
  }));

  it('refuses a deactivated participant', async () => {
    await setDiscipline(rivalId, 'deactivated');
    expectDeactivatedRefusal(await create());
  });

  it('allows a sign-up-blocked participant', async () => {
    await setDiscipline(rivalId, 'blocked');
    expect((await create()).statusCode).toBe(201);
  });
});

describe('setOverride', () => {
  it('refuses a deactivated player, with that reason and not the wrestler name one', async () => {
    await setDiscipline(rivalId, 'deactivated');
    const { championshipId } = await repos.competition.championships.create({ name: 'World', type: 'singles' });
    await repos.competition.championships.update(championshipId, { isActive: true });
    expectDeactivatedRefusal(await call<Refusal>(setOverride, staffPost({
      championshipId,
      playerId: rivalId,
      overrideType: 'bump_to_top',
      reason: 'Earned it',
    })));
  });
});

describe('tag teams', () => {
  const create = () => call<Refusal>(createTagTeam, memberPost('caller-sub', { name: 'Team', partnerId: rivalId }));

  it('refuses a deactivated partner', async () => {
    await setDiscipline(rivalId, 'deactivated');
    expectUnavailable(await create());
    expect(await repos.roster.tagTeams.list()).toEqual([]);
  });

  it('allows a sign-up-blocked partner, since forming a team is not signing up', async () => {
    await setDiscipline(rivalId, 'blocked');
    expect((await create()).statusCode).toBe(201);
  });

  it.each([0, 1])('refuses approving a team with a deactivated member (member %i)', async (index) => {
    const ids = [callerId, rivalId];
    await setDiscipline(ids[index], 'deactivated');
    const { tagTeamId } = await repos.roster.tagTeams.create({
      name: 'Team',
      player1Id: callerId,
      player2Id: rivalId,
      status: 'pending_admin',
    });
    expectDeactivatedRefusal(await call<Refusal>(approveTagTeam, staffPost({}, { tagTeamId })));
    expect((await repos.roster.tagTeams.findById(tagTeamId))?.status).toBe('pending_admin');
  });
});

describe('stables', () => {
  const addStable = async (status: 'pending' | 'active' | 'disbanded', memberIds = [callerId]): Promise<string> =>
    (await repos.roster.stables.create({ name: 'Stable', leaderId: callerId, memberIds, status })).stableId;

  it('refuses inviting a deactivated player', async () => {
    await setDiscipline(rivalId, 'deactivated');
    const stableId = await addStable('active');
    expectUnavailable(await call<Refusal>(
      inviteToStable,
      memberPost('caller-sub', { playerId: rivalId }, { stableId }),
    ));
  });

  it('allows inviting a sign-up-blocked player', async () => {
    await setDiscipline(rivalId, 'blocked');
    const stableId = await addStable('active');
    const { statusCode } = await call(
      inviteToStable,
      memberPost('caller-sub', { playerId: rivalId }, { stableId }),
    );
    expect(statusCode).toBe(201);
  });

  it('skips a deactivated member on reactivation', async () => {
    const stableId = await addStable('disbanded', [callerId, rivalId]);
    await setDiscipline(rivalId, 'deactivated');
    const { statusCode, body } = await call<{
      restoredMemberIds: string[];
      skippedMembers: Array<{ playerId: string; reason: string }>;
    }>(reactivateStable, staffPost({}, { stableId }));
    expect(statusCode).toBe(200);
    expect(body.restoredMemberIds).toEqual([callerId]);
    expect(body.skippedMembers).toEqual([{ playerId: rivalId, reason: 'deactivated' }]);
    expect((await repos.roster.players.findById(rivalId))?.stableId).toBeUndefined();
  });

  it('refuses approving a stable with a deactivated leader', async () => {
    const stableId = await addStable('pending');
    await setDiscipline(callerId, 'deactivated');
    expectDeactivatedRefusal(await call<Refusal>(approveStable, staffPost({}, { stableId })));
    expect((await repos.roster.stables.findById(stableId))?.status).toBe('pending');
  });
});

describe('deletePlayer', () => {
  const remove = (playerId: string) => call<Refusal>(deletePlayer, authedEvent('admin-sub', 'Admin', {
    httpMethod: 'DELETE',
    pathParameters: { playerId },
  }));

  const setStrikes = (strikes: PlayerStrike[]) =>
    repos.roster.players.updateDiscipline(rivalId, { strikes, deactivations: [], deactivatedAt: null }, 0);

  it.each([
    ['warned', [1]],
    ['signup-blocked', [3, 1]],
    ['cooldown', [10, 8]],
  ])('refuses while %s', async (_status, daysAgo) => {
    await setStrikes(daysAgo.map(strike));
    const { statusCode, body } = await remove(rivalId);
    expect(statusCode).toBe(409);
    expect(body.code).toBe('DISCIPLINE_ACTIVE');
    expect(await repos.roster.players.findById(rivalId)).not.toBeNull();
  });

  it('refuses while deactivated', async () => {
    await setDiscipline(rivalId, 'deactivated');
    expectDeactivatedRefusal(await remove(rivalId));
    expect(await repos.roster.players.findById(rivalId)).not.toBeNull();
  });

  it('allows it once strikes have lapsed', async () => {
    await setStrikes([strike(8)]);
    await deletePlayer(authedEvent('admin-sub', 'Admin', {
      httpMethod: 'DELETE',
      pathParameters: { playerId: rivalId },
    }), ctx, noCallback);
    expect(await repos.roster.players.findById(rivalId)).toBeNull();
  });
});

describe('reads', () => {
  it('flags a deactivated player in the directory and keeps the name', async () => {
    await setDiscipline(rivalId, 'deactivated');
    const { body } = await call<Array<{ playerId: string; name: string; currentWrestler: string; deactivated?: boolean }>>(
      getPlayers,
      makeEvent({ queryStringParameters: { view: 'directory' } }),
    );
    expect(body.find((row) => row.playerId === rivalId)).toEqual({
      playerId: rivalId,
      name: 'Rival',
      currentWrestler: 'Kane',
      deactivated: true,
    });
    expect(body.find((row) => row.playerId === callerId)).not.toHaveProperty('deactivated');
  });

  it('keeps getCheckIns and getCheckInSummary in step', async () => {
    const eventId = await addEvent();
    await repos.leagueOps.events.upsertCheckIn(eventId, callerId, 'available');
    await repos.leagueOps.events.upsertCheckIn(eventId, rivalId, 'available');
    await setDiscipline(rivalId, 'deactivated');

    const list = await call<{ available: Array<{ playerId: string }>; noResponse: Array<{ playerId: string }> }>(
      getCheckIns,
      authedEvent('admin-sub', 'Admin', { pathParameters: { eventId } }),
    );
    const summary = await call<{ available: number; total: number }>(
      getCheckInSummary,
      authedEvent('caller-sub', 'Wrestler', { pathParameters: { eventId } }),
    );

    expect(list.body.available.map((row) => row.playerId)).toEqual([callerId]);
    expect(list.body.noResponse.map((row) => row.playerId)).not.toContain(rivalId);
    expect(summary.body).toMatchObject({ available: 1, total: 1 });
    expect(await repos.leagueOps.events.listCheckIns(eventId)).toHaveLength(2);
  });

  it.each<DisciplineState>(['blocked', 'deactivated'])('getQueue hides a %s player from others', async (state) => {
    await repos.leagueOps.matchmaking.putQueue({
      playerId: rivalId,
      joinedAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + 600,
    });
    await setDiscipline(rivalId, state);

    const others = await call<Array<{ playerId: string }>>(getQueue, authedEvent('caller-sub', 'Wrestler'));
    expect(others.body).toEqual([]);

    const own = await call<Array<{ playerId: string }>>(getQueue, authedEvent('rival-sub', 'Wrestler'));
    expect(own.body.map((row) => row.playerId)).toEqual([rivalId]);
  });

  it.each<DisciplineState>(['blocked', 'deactivated'])('getOnline hides a %s player from others', async (state) => {
    await appearOnline(rivalId);
    await setDiscipline(rivalId, state);
    const { body } = await call<Array<{ playerId: string }>>(getOnline, authedEvent('caller-sub', 'Wrestler'));
    expect(body).toEqual([]);
  });

  it('getOnline still lists a clear player', async () => {
    await appearOnline(rivalId);
    const { body } = await call<Array<{ playerId: string }>>(getOnline, authedEvent('caller-sub', 'Wrestler'));
    expect(body.map((row) => row.playerId)).toEqual([rivalId]);
  });

  it('masks a deactivated player\'s psnId on hydrated slots', async () => {
    await repos.roster.players.update(rivalId, { psnId: 'rival_psn' });
    await setDiscipline(rivalId, 'deactivated');
    const player = await repos.roster.players.findById(rivalId);
    const [slot] = hydrateMatchSlots(
      [{ slotId: 's1', position: 1, playerId: rivalId }],
      new Map(player ? [[rivalId, player]] : []),
    );
    expect(slot.psnId).toBeUndefined();
    expect(slot.wrestlerName).toBe('Kane');
  });

  it('masks a deactivated participant\'s psnId on the event card', async () => {
    await repos.roster.players.update(rivalId, { psnId: 'rival_psn' });
    await repos.roster.players.update(callerId, { psnId: 'caller_psn' });
    const eventId = await addEvent();
    const matchId = await addScheduledMatch([callerId, rivalId]);
    await repos.leagueOps.events.update(eventId, {
      matchCards: [{ matchId, position: 1, designation: 'midcard' }],
    });
    await setDiscipline(rivalId, 'deactivated');

    const { body } = await call<{
      enrichedMatches: Array<{ matchData?: { participants: Array<{ playerId: string; psnId?: string }> } }>;
    }>(getEvent, makeEvent({ pathParameters: { eventId } }));

    const participants = body.enrichedMatches[0].matchData?.participants ?? [];
    expect(participants.find((row) => row.playerId === rivalId)?.psnId).toBeUndefined();
    expect(participants.find((row) => row.playerId === callerId)?.psnId).toBe('caller_psn');
  });
});
