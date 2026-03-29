export type ChallengeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'countered'
  | 'scheduled'
  | 'expired'
  | 'cancelled';

export interface Challenge {
  challengeId: string;
  challengerId: string;
  challengedId: string;
  matchType: string;
  stipulation?: string;
  championshipId?: string;
  message?: string;
  status: ChallengeStatus;
  responseMessage?: string;
  counteredChallengeId?: string;
  matchId?: string;
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
  challengerTagTeam?: TagTeamChallengeInfo;
  challengedTagTeam?: TagTeamChallengeInfo;
}

export interface CreateChallengeInput {
  challengedId: string;
  matchType: string;
  stipulation?: string;
  championshipId?: string;
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
