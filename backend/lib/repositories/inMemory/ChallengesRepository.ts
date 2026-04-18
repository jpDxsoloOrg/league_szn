import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  ChallengeCreateInput,
  ChallengesRepository,
} from '../ChallengesRepository';
import type { Challenge, ChallengeStatus } from '../types';

export class InMemoryChallengesRepository implements ChallengesRepository {
  readonly store = new Map<string, Challenge>();

  async findById(challengeId: string): Promise<Challenge | null> {
    return this.store.get(challengeId) ?? null;
  }

  async list(): Promise<Challenge[]> {
    const items = Array.from(this.store.values());
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return items;
  }

  async listByStatus(status: ChallengeStatus): Promise<Challenge[]> {
    return Array.from(this.store.values()).filter(
      (c) => c.status === status,
    );
  }

  async listByChallenger(playerId: string): Promise<Challenge[]> {
    return Array.from(this.store.values()).filter(
      (c) => c.challengerId === playerId,
    );
  }

  async listByChallenged(playerId: string): Promise<Challenge[]> {
    return Array.from(this.store.values()).filter(
      (c) => c.challengedId === playerId,
    );
  }

  async listByPlayer(playerId: string): Promise<Challenge[]> {
    const items = Array.from(this.store.values()).filter(
      (c) => c.challengerId === playerId || c.challengedId === playerId,
    );
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return items;
  }

  async create(input: ChallengeCreateInput): Promise<Challenge> {
    const now = new Date().toISOString();
    const item: Challenge = {
      challengeId: uuidv4(),
      challengerId: input.challengerId,
      challengedId: input.challengedId,
      matchType: input.matchType,
      ...(input.stipulation !== undefined ? { stipulation: input.stipulation } : {}),
      ...(input.championshipId !== undefined ? { championshipId: input.championshipId } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
      ...(input.challengeMode !== undefined ? { challengeMode: input.challengeMode } : {}),
      ...(input.challengerTagTeamId !== undefined ? { challengerTagTeamId: input.challengerTagTeamId } : {}),
      ...(input.challengedTagTeamId !== undefined ? { challengedTagTeamId: input.challengedTagTeamId } : {}),
      status: 'pending',
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.challengeId, item);
    return item;
  }

  async update(
    challengeId: string,
    patch: Partial<Challenge>,
  ): Promise<Challenge> {
    const existing = this.store.get(challengeId);
    if (!existing) throw new NotFoundError('Challenge', challengeId);
    const updated: Challenge = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(challengeId, updated);
    return updated;
  }

  async delete(challengeId: string): Promise<void> {
    this.store.delete(challengeId);
  }
}
