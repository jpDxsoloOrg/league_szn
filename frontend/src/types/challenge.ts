export type ChallengeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'partially_declined'
  | 'countered'
  | 'scheduled'
  | 'auto_scheduled'
  | 'expired'
  | 'cancelled';

export interface ChallengeResponseRecord {
  status: 'pending' | 'accepted' | 'declined';
  declineReason?: string;
}

export interface Challenge {
  challengeId: string;
  challengerId: string;
  challengedId: string; // Primary opponent (for GSI). Prefer `opponentIds` for multi-opponent challenges.
  opponentIds?: string[];
  responses?: Record<string, ChallengeResponseRecord>;
  matchType: string;
  stipulation?: string;
  championshipId?: string;
  challengeNote?: string;
  /** @deprecated Use `challengeNote` */
  message?: string;
  status: ChallengeStatus;
  responseMessage?: string;
  counteredChallengeId?: string;
  matchId?: string;
  scheduledEventId?: string;
  challengeMode?: 'singles' | 'tag_team';
  challengerTagTeamId?: string;
  challengedTagTeamId?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChallengePlayerInfo {
  playerId?: string;
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
}

export interface TagTeamChallengeInfo {
  tagTeamId: string;
  tagTeamName: string;
  player1: ChallengePlayerInfo;
  player2: ChallengePlayerInfo;
}

export interface ChallengeWithPlayers extends Challenge {
  challenger: ChallengePlayerInfo;
  challenged: ChallengePlayerInfo;
  opponents?: ChallengePlayerInfo[];
  challengerTagTeam?: TagTeamChallengeInfo;
  challengedTagTeam?: TagTeamChallengeInfo;
}

export interface CreateChallengeInput {
  challengedId?: string; // Legacy single-opponent field
  opponentIds?: string[];
  matchType: string;
  stipulation?: string;
  championshipId?: string;
  challengeNote?: string;
  /** @deprecated Use `challengeNote` */
  message?: string;
  challengeMode?: 'singles' | 'tag_team';
  challengedTagTeamId?: string;
}

export interface CounterChallengeInput {
  originalChallengeId: string;
  matchType: string;
  stipulation?: string;
  message?: string;
}
