import {
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import type { APIGatewayProxyResult } from 'aws-lambda';
import { expirePendingInvitations } from '../functions/matchmaking/leavePresence';
import type { AuthContext } from './auth';
import type { PlayerDisciplineSummary, StrikeOutcome } from './discipline';
import { createNotification, type NotificationType } from './notifications';
import { getRepositories } from './repositories';
import type {
  Challenge,
  ChallengeStatus,
  Match,
  Player,
  PlayerDeactivation,
  PlayerStrike,
} from './repositories/types';
import { refused } from './response';
import { createReviewerNameLookup, isCognitoId, UNKNOWN_REVIEWER } from './reviewerName';

/**
 * The side effects of a discipline action: Cognito, soft holds, holdings and
 * notifications. The rules themselves live in `lib/discipline.ts`.
 */

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const STAFF_GROUPS = new Set(['Admin', 'Moderator']);

export interface DisciplineHoldings {
  titles: { championshipId: string; name: string }[];
  matches: {
    matchId: string;
    date: string;
    status: 'scheduled' | 'open-signups';
    /** Lets staff tell bookings on one card apart. */
    matchFormat?: string;
    /** Names of the other side, partners left out. Empty while the other spots are open. */
    opponents: string[];
    eventId?: string;
    tournamentId?: string;
  }[];
  /** Status 'accepted', tag team membership included. */
  challenges: { challengeId: string; opponentName: string }[];
  /** Any not completed that the player is in. */
  tournaments: { tournamentId: string; name: string; status: string }[];
}

export interface PlayerDisciplineDetail {
  playerId: string;
  /** disciplineVersion, 0 when absent; send back as expectedVersion. */
  version: number;
  summary: PlayerDisciplineSummary;
  /** Null while deactivated; send back as expectedOutcome. */
  nextStrikeOutcome: StrikeOutcome | null;
  /** Full history, newest first. */
  strikes: PlayerStrike[];
  /** Newest first. */
  deactivations: PlayerDeactivation[];
  /** False for an unlinked player or a dead link. */
  hasLinkedAccount: boolean;
  /** False when unlinked, null on a Cognito error. */
  isStaffAccount: boolean | null;
  /** Null when unlinked or on a Cognito error. */
  accountEnabled: boolean | null;
  holdings: DisciplineHoldings;
}

/** not-needed: no Cognito change was due. */
export type AccountSync = 'ok' | 'failed' | 'not-linked' | 'not-needed';

export interface DisciplineActionResult {
  playerId: string;
  version: number;
  summary: PlayerDisciplineSummary;
  accountSync: AccountSync;
  /** False only when cleanup was due and did not finish. */
  softHoldsCleared: boolean;
  /** Filled only when the action deactivated the player. */
  holdings: DisciplineHoldings;
}

export const emptyHoldings = (): DisciplineHoldings => ({ titles: [], matches: [], challenges: [], tournaments: [] });

export const disciplineConflict = (): APIGatewayProxyResult =>
  refused(409, 'DISCIPLINE_CONFLICT', 'This player changed since you loaded them. Reload and try again.');

export const isValidVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * The name kept on a discipline record: the Admin's player name, else their
 * username. In this pool a username can be the raw Cognito id, which is not a name.
 */
export async function resolveActorName(auth: AuthContext): Promise<string> {
  const fallback = isCognitoId(auth.username) ? UNKNOWN_REVIEWER : auth.username;
  if (!auth.sub) return fallback;
  const actor = await getRepositories().roster.players.findByUserId(auth.sub);
  return actor?.name ?? fallback;
}

/**
 * History as staff should read it. Rows written before `resolveActorName` learned
 * the fallback hold a Cognito id as the name, so those are resolved here.
 */
export async function withReadableActors(
  strikes: PlayerStrike[],
  deactivations: PlayerDeactivation[],
): Promise<{ strikes: PlayerStrike[]; deactivations: PlayerDeactivation[] }> {
  const stored = [
    ...strikes.flatMap(({ issuedByName, clearedByName }) => [issuedByName, clearedByName]),
    ...deactivations.flatMap(({ deactivatedByName, reactivatedByName }) => [deactivatedByName, reactivatedByName]),
  ];
  const players = stored.some(isCognitoId) ? await getRepositories().roster.players.list() : [];
  const staffName = createReviewerNameLookup(players);
  const readable = (name: string): string => staffName(name) ?? UNKNOWN_REVIEWER;

  return {
    strikes: strikes.map((strike) => ({
      ...strike,
      issuedByName: readable(strike.issuedByName),
      ...(strike.clearedByName ? { clearedByName: readable(strike.clearedByName) } : {}),
    })),
    deactivations: deactivations.map((record) => ({
      ...record,
      deactivatedByName: readable(record.deactivatedByName),
      ...(record.reactivatedByName ? { reactivatedByName: readable(record.reactivatedByName) } : {}),
    })),
  };
}

// ─── Cognito ────────────────────────────────────────────────────────

const isDeadLink = (err: unknown): boolean => err instanceof Error && err.name === 'UserNotFoundException';

export interface AccountRecord {
  enabled: boolean;
  email?: string;
}

async function fetchUser(username: string) {
  return cognitoClient.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
}

/** Whether the linked account is in a staff group. Null for a dead link; other errors throw. */
export async function readIsStaffAccount(userId: string): Promise<boolean | null> {
  try {
    const { Groups } = await cognitoClient.send(
      new AdminListGroupsForUserCommand({ UserPoolId: USER_POOL_ID, Username: userId }),
    );
    return (Groups ?? []).some((group) => STAFF_GROUPS.has(group.GroupName ?? ''));
  } catch (err) {
    if (isDeadLink(err)) return null;
    throw err;
  }
}

/** The linked account's state. Null for a dead link; other errors throw. */
export async function readAccount(userId: string): Promise<AccountRecord | null> {
  try {
    const { Enabled, UserAttributes } = await fetchUser(userId);
    const email = UserAttributes?.find((attribute) => attribute.Name === 'email')?.Value;
    return { enabled: Enabled !== false, ...(email ? { email } : {}) };
  } catch (err) {
    if (isDeadLink(err)) return null;
    throw err;
  }
}

type AccountView = Pick<PlayerDisciplineDetail, 'hasLinkedAccount' | 'isStaffAccount' | 'accountEnabled'>;

/** Never throws: the discipline view must still open when Cognito is down. */
export async function readAccountView(userId: string | undefined): Promise<AccountView> {
  const unlinked: AccountView = { hasLinkedAccount: false, isStaffAccount: false, accountEnabled: null };
  if (!userId) return unlinked;
  try {
    const [isStaffAccount, account] = await Promise.all([readIsStaffAccount(userId), readAccount(userId)]);
    if (isStaffAccount === null || account === null) return unlinked;
    return { hasLinkedAccount: true, isStaffAccount, accountEnabled: account.enabled };
  } catch (err) {
    console.error('Failed to read linked account:', err);
    return { hasLinkedAccount: true, isStaffAccount: null, accountEnabled: null };
  }
}

type AccountSyncResult = Extract<AccountSync, 'ok' | 'failed' | 'not-linked'>;

async function syncAccount(send: () => Promise<unknown>): Promise<AccountSyncResult> {
  try {
    await send();
    return 'ok';
  } catch (err) {
    if (isDeadLink(err)) return 'not-linked';
    console.error('Failed to sync account state:', err);
    return 'failed';
  }
}

export const disableAccount = (userId: string): Promise<AccountSyncResult> =>
  syncAccount(() => cognitoClient.send(new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: userId })));

export const enableAccount = (userId: string): Promise<AccountSyncResult> =>
  syncAccount(() => cognitoClient.send(new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: userId })));

/**
 * The linked player for a Cognito username, through AdminGetUser's sub. Null when unlinked.
 * Errors propagate: this guards Enable and Delete, which must fail closed.
 */
export async function findPlayerForCognitoUsername(username: string): Promise<Player | null> {
  const { UserAttributes } = await fetchUser(username);
  const sub = UserAttributes?.find((attribute) => attribute.Name === 'sub')?.Value;
  if (!sub) return null;
  return getRepositories().roster.players.findByUserId(sub);
}

// ─── Soft holds and holdings ────────────────────────────────────────

/** Tests whether a challenge involves the player, directly or through any of their tag teams. */
async function challengeMembership(playerId: string): Promise<{
  isInvolved: (challenge: Challenge) => boolean;
  isOnChallengerSide: (challenge: Challenge) => boolean;
}> {
  const teams = await getRepositories().roster.tagTeams.listByPlayer(playerId);
  const teamIds = new Set(teams.map((team) => team.tagTeamId));
  const inTeam = (tagTeamId: string | undefined) => tagTeamId !== undefined && teamIds.has(tagTeamId);
  const isOnChallengerSide = (challenge: Challenge) =>
    challenge.challengerId === playerId || inTeam(challenge.challengerTagTeamId);
  const isInvolved = (challenge: Challenge) =>
    isOnChallengerSide(challenge) || challenge.challengedId === playerId || inTeam(challenge.challengedTagTeamId);
  return { isInvolved, isOnChallengerSide };
}

async function cancelOpenChallenges(playerId: string): Promise<void> {
  const { user: { challenges } } = getRepositories();
  const { isInvolved } = await challengeMembership(playerId);
  const statuses: ChallengeStatus[] = ['pending', 'countered'];
  const open = (await Promise.all(statuses.map((status) => challenges.listByStatus(status)))).flat();
  // listByPlayer would miss a tag partner's challenge. A false result means the
  // challenge moved on, which is already handled.
  await Promise.all(
    open
      .filter(isInvolved)
      .map((challenge) => challenges.updateIfStatus(challenge.challengeId, { status: 'cancelled' }, challenge.status)),
  );
}

/**
 * Clears queue, presence, pending invitations and pending or countered
 * challenges. Check-ins, card bookings and accepted challenges stay (decision 7).
 * Every step runs even if another fails. Resolves false if any did; never throws.
 */
export async function clearSoftHolds(playerId: string): Promise<boolean> {
  const { leagueOps: { matchmaking } } = getRepositories();
  const results = await Promise.allSettled([
    matchmaking.deletePresence(playerId),
    matchmaking.deleteQueue(playerId),
    expirePendingInvitations('from', playerId),
    expirePendingInvitations('to', playerId),
    cancelOpenChallenges(playerId),
  ]);
  const failures = results.filter((result) => result.status === 'rejected');
  failures.forEach((failure) => console.error('Failed to clear a soft hold:', failure.reason));
  return failures.length === 0;
}

/** Everyone on the match: explicit participants plus anyone holding a slot. */
function isOnMatch(match: Match, playerId: string): boolean {
  return (match.participants ?? []).includes(playerId)
    || (match.slots ?? []).some((slot) => slot.playerId === playerId);
}

/** Everyone on the match who is not on the player's side. */
function opponentIdsOn(match: Match, playerId: string): string[] {
  const slots = match.slots ?? [];
  const ownTeamLabel = slots.find((slot) => slot.playerId === playerId)?.teamLabel;
  const partners = new Set([
    playerId,
    ...(match.teams?.find((team) => team.includes(playerId)) ?? []),
    ...slots.flatMap((slot) => (slot.playerId && ownTeamLabel && slot.teamLabel === ownTeamLabel ? [slot.playerId] : [])),
  ]);
  const everyone = [...(match.participants ?? []), ...slots.flatMap((slot) => (slot.playerId ? [slot.playerId] : []))];
  return [...new Set(everyone)].filter((id) => !partners.has(id));
}

async function opponentNameFor(challenge: Challenge, onChallengerSide: boolean): Promise<string> {
  const { roster: { players, tagTeams } } = getRepositories();
  const opposingTeamId = onChallengerSide ? challenge.challengedTagTeamId : challenge.challengerTagTeamId;
  const opposingTeam = opposingTeamId ? await tagTeams.findById(opposingTeamId) : null;
  if (opposingTeam) return opposingTeam.name;
  const opposing = await players.findByIdWithDeleted(onChallengerSide ? challenge.challengedId : challenge.challengerId);
  return opposing?.name ?? 'Unknown';
}

/** What staff must handle by hand. Scans, so it runs only on modal open and on strike 3. */
export async function getHoldings(playerId: string): Promise<DisciplineHoldings> {
  const {
    competition: { championships, matches, tournaments },
    roster: { players },
    user: { challenges },
  } = getRepositories();

  const [allChampionships, scheduled, openSignups, accepted, allTournaments, membership] = await Promise.all([
    championships.list(),
    matches.listByStatus('scheduled'),
    matches.listByStatus('open-signups'),
    challenges.listByStatus('accepted'),
    tournaments.list(),
    challengeMembership(playerId),
  ]);

  const onScheduled = scheduled.filter((match) => isOnMatch(match, playerId));
  const onOpenSignups = openSignups.filter((match) => isOnMatch(match, playerId));
  const opponentIds = new Set([...onScheduled, ...onOpenSignups].flatMap((match) => opponentIdsOn(match, playerId)));
  const opponentRows = await Promise.all([...opponentIds].map((id) => players.findByIdWithDeleted(id)));
  const namesById = new Map(opponentRows.flatMap((row) => (row ? [[row.playerId, row.name] as const] : [])));

  const toMatchHolding = (status: 'scheduled' | 'open-signups') => (match: Match): DisciplineHoldings['matches'][number] => {
    const matchFormat = match.matchFormat ?? match.matchType;
    return {
      matchId: match.matchId,
      date: match.date,
      status,
      ...(matchFormat ? { matchFormat } : {}),
      opponents: opponentIdsOn(match, playerId).flatMap((id) => namesById.get(id) ?? []),
      ...(match.eventId ? { eventId: match.eventId } : {}),
      ...(match.tournamentId ? { tournamentId: match.tournamentId } : {}),
    };
  };

  return {
    titles: allChampionships
      .filter(({ currentChampion }) => (Array.isArray(currentChampion)
        ? currentChampion.includes(playerId)
        : currentChampion === playerId))
      .map(({ championshipId, name }) => ({ championshipId, name })),
    matches: [
      ...onScheduled.map(toMatchHolding('scheduled')),
      ...onOpenSignups.map(toMatchHolding('open-signups')),
    ],
    challenges: await Promise.all(
      accepted.filter(membership.isInvolved).map(async (challenge) => ({
        challengeId: challenge.challengeId,
        opponentName: await opponentNameFor(challenge, membership.isOnChallengerSide(challenge)),
      })),
    ),
    tournaments: allTournaments
      .filter((tournament) => tournament.status !== 'completed' && (tournament.participants ?? []).includes(playerId))
      .map(({ tournamentId, name, status }) => ({ tournamentId, name, status })),
  };
}

// ─── Notifications ──────────────────────────────────────────────────

/** Skips a player with no account. Never throws: the action has already happened. */
export async function notifyDiscipline(
  userId: string | undefined,
  type: Extract<NotificationType, 'strike_issued' | 'strike_removed' | 'account_reactivated'>,
  message: string,
  sourceId: string,
): Promise<void> {
  if (!userId) return;
  try {
    await createNotification({ userId, type, message, sourceId, sourceType: 'discipline' });
  } catch (err) {
    console.error('Failed to send discipline notification:', err);
  }
}
