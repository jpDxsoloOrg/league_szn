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
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChallengePlayerInfo {
  playerName: string;
  wrestlerName: string;
  imageUrl?: string;
}

export interface ChallengeWithPlayers extends Challenge {
  challenger: ChallengePlayerInfo;
  challenged: ChallengePlayerInfo;
}

export interface CreateChallengeInput {
  challengedId: string;
  matchType: string;
  stipulation?: string;
  championshipId?: string;
  message?: string;
}

export interface CounterChallengeInput {
  originalChallengeId: string;
  matchType: string;
  stipulation?: string;
  message?: string;
}
