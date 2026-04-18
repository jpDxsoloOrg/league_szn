import type { Challenge, ChallengeStatus } from './types';

export interface ChallengeCreateInput {
  challengerId: string;
  challengedId: string;
  matchType: string;
  stipulation?: string;
  championshipId?: string;
  message?: string;
  challengeMode?: 'singles' | 'tag_team';
  challengerTagTeamId?: string;
  challengedTagTeamId?: string;
  expiresAt: string;
}

export interface ChallengesRepository {
  findById(challengeId: string): Promise<Challenge | null>;
  list(): Promise<Challenge[]>;
  listByStatus(status: ChallengeStatus): Promise<Challenge[]>;
  listByChallenger(playerId: string): Promise<Challenge[]>;
  listByChallenged(playerId: string): Promise<Challenge[]>;
  listByPlayer(playerId: string): Promise<Challenge[]>;
  create(input: ChallengeCreateInput): Promise<Challenge>;
  update(challengeId: string, patch: Partial<Challenge>): Promise<Challenge>;
  delete(challengeId: string): Promise<void>;
}
