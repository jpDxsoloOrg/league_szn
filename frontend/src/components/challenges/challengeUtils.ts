import type { BadgeTone } from '../ui/Badge';
import type { Championship, Player } from '../../types';
import type {
  Challenge,
  ChallengePlayerInfo,
  ChallengeStatus,
  ChallengeWithPlayers,
  TagTeamChallengeInfo,
} from '../../types/challenge';

/** Mirrors CHALLENGE_EXPIRY_DAYS in backend/lib/challengeExpiry.ts. */
const CHALLENGE_EXPIRY_DAYS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export const CHALLENGE_STATUS_TONE: Record<ChallengeStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'win',
  declined: 'loss',
  countered: 'violet',
  scheduled: 'primary',
  expired: 'draw',
  cancelled: 'neutral',
};

/**
 * The moment a challenge stops accepting responses: the earlier of its stored
 * `expiresAt` and `createdAt` plus the expiry window, matching the backend.
 */
export function getChallengeDeadline(challenge: Pick<Challenge, 'createdAt' | 'expiresAt'>): number | null {
  const deadlines = [
    Date.parse(challenge.expiresAt),
    Date.parse(challenge.createdAt) + CHALLENGE_EXPIRY_DAYS * DAY_MS,
  ].filter((deadline) => Number.isFinite(deadline));
  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}

/**
 * The status to show. The expiry sweep runs hourly, so a pending challenge can
 * be past its deadline before its stored status changes.
 */
export function getDisplayStatus(
  challenge: Pick<Challenge, 'status' | 'createdAt' | 'expiresAt'>,
  now: number = Date.now(),
): ChallengeStatus {
  if (challenge.status !== 'pending') return challenge.status;
  const deadline = getChallengeDeadline(challenge);
  return deadline !== null && now >= deadline ? 'expired' : 'pending';
}

export function getDaysRemaining(
  challenge: Pick<Challenge, 'createdAt' | 'expiresAt'>,
  now: number = Date.now(),
): number {
  const deadline = getChallengeDeadline(challenge);
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / DAY_MS));
}

export function isChallengerSide(challenge: ChallengeWithPlayers, playerId: string | null): boolean {
  if (!playerId) return false;
  if (challenge.challengerId === playerId) return true;
  const team = challenge.challengeMode === 'tag_team' ? challenge.challengerTagTeam : undefined;
  return team?.player1?.playerId === playerId || team?.player2?.playerId === playerId;
}

export function isChallengedSide(challenge: ChallengeWithPlayers, playerId: string | null): boolean {
  if (!playerId) return false;
  if (challenge.challengedId === playerId) return true;
  const team = challenge.challengeMode === 'tag_team' ? challenge.challengedTagTeam : undefined;
  return team?.player1?.playerId === playerId || team?.player2?.playerId === playerId;
}

/**
 * The challenge a call-out promo produced. Promos do not store a challenge id,
 * and the editor creates the challenge right after the promo, so this picks the
 * challenge between the two players that is closest in time to the promo.
 */
export function findCallOutChallenge(
  challenges: ChallengeWithPlayers[],
  promo: { playerId: string; createdAt: string },
  targetPlayerId: string,
): ChallengeWithPlayers | null {
  const promoTime = Date.parse(promo.createdAt);
  const distance = (challenge: ChallengeWithPlayers) => Math.abs(Date.parse(challenge.createdAt) - promoTime);
  const candidates = challenges
    .filter((challenge) => challenge.challengerId === promo.playerId && challenge.challengedId === targetPlayerId)
    .sort((first, second) => distance(first) - distance(second));
  return candidates[0] ?? null;
}

export type ChallengeTitleCandidate = Pick<Player, 'playerId' | 'divisionId'>;

export interface ChallengeTitleSubject {
  challengeMode: 'singles' | 'tag_team';
  matchType: string;
  /** The players on each side, once both sides are known. */
  sides: ChallengeTitleCandidate[][];
}

/**
 * The titles this challenge can be for: the right kind for the challenge and
 * its match type, open to everyone in it, and vacant or held by one side. A
 * result crowns whoever wins, so a champion outside the challenge can't lose
 * their title. Mirrors challengeTitleFitError in backend/lib/challengeTitle.ts.
 */
export function getChallengeTitleOptions(
  championships: Championship[],
  { challengeMode, matchType, sides }: ChallengeTitleSubject,
): Championship[] {
  if (!matchType || sides.length < 2) return [];

  const titleType: Championship['type'] = challengeMode === 'tag_team' ? 'tag' : 'singles';
  const isTagFormat = matchType.toLowerCase().includes('tag');
  if (isTagFormat !== (titleType === 'tag')) return [];

  return championships.filter((championship) => {
    if (championship.type !== titleType || championship.isActive === false) return false;
    const { divisionId } = championship;
    if (divisionId && sides.flat().some((player) => player.divisionId !== divisionId)) return false;
    const holders = [championship.currentChampion ?? []].flat();
    return holders.length === 0
      || sides.some((side) => holders.every((holder) => side.some((player) => player.playerId === holder)));
  });
}

export interface ChallengeSide {
  name: string;
  detail: string;
  imageUrl?: string;
}

function toSide(player: ChallengePlayerInfo, team?: TagTeamChallengeInfo): ChallengeSide {
  if (team) {
    return {
      name: team.tagTeamName,
      detail: `${team.player1.wrestlerName} & ${team.player2.wrestlerName}`,
    };
  }
  return { name: player.wrestlerName, detail: player.playerName, imageUrl: player.imageUrl };
}

/** Both sides of a challenge, as tag teams when it is a tag team challenge. */
export function getChallengeSides(challenge: ChallengeWithPlayers): [ChallengeSide, ChallengeSide] {
  const isTagTeam = challenge.challengeMode === 'tag_team';
  return [
    toSide(challenge.challenger, isTagTeam ? challenge.challengerTagTeam : undefined),
    toSide(challenge.challenged, isTagTeam ? challenge.challengedTagTeam : undefined),
  ];
}
