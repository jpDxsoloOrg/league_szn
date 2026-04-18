import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type { PromoCreateInput, PromosRepository } from '../PromosRepository';
import type { Promo, PromoType, ReactionType } from '../types';

export class InMemoryPromosRepository implements PromosRepository {
  readonly store = new Map<string, Promo>();

  async findById(promoId: string): Promise<Promo | null> {
    return this.store.get(promoId) ?? null;
  }

  async list(): Promise<Promo[]> {
    return Array.from(this.store.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async listByPlayer(playerId: string): Promise<Promo[]> {
    return Array.from(this.store.values())
      .filter((p) => p.playerId === playerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listByType(promoType: PromoType): Promise<Promo[]> {
    return Array.from(this.store.values())
      .filter((p) => p.promoType === promoType)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listResponsesTo(targetPromoId: string): Promise<Promo[]> {
    return Array.from(this.store.values())
      .filter((p) => p.targetPromoId === targetPromoId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async create(input: PromoCreateInput): Promise<Promo> {
    const now = new Date().toISOString();
    const item: Promo = {
      promoId: uuidv4(),
      playerId: input.playerId,
      promoType: input.promoType,
      title: input.title,
      content: input.content,
      targetPlayerId: input.targetPlayerId,
      targetPromoId: input.targetPromoId,
      matchId: input.matchId,
      championshipId: input.championshipId,
      imageUrl: input.imageUrl,
      challengeMode: input.challengeMode,
      challengerTagTeamName: input.challengerTagTeamName,
      targetTagTeamName: input.targetTagTeamName,
      reactions: {},
      reactionCounts: { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
      isPinned: false,
      isHidden: false,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.promoId, item);
    return item;
  }

  async update(promoId: string, patch: Partial<Promo>): Promise<Promo> {
    const existing = this.store.get(promoId);
    if (!existing) throw new NotFoundError('Promo', promoId);
    const updated: Promo = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(promoId, updated);
    return updated;
  }

  async delete(promoId: string): Promise<void> {
    this.store.delete(promoId);
  }

  async addReaction(promoId: string, userId: string, reaction: ReactionType): Promise<Promo> {
    const existing = this.store.get(promoId);
    if (!existing) throw new NotFoundError('Promo', promoId);

    const reactions = { ...existing.reactions };
    const reactionCounts = { ...existing.reactionCounts };

    // Remove previous reaction if the user already reacted
    const previousReaction = reactions[userId];
    if (previousReaction) {
      reactionCounts[previousReaction] = Math.max(0, (reactionCounts[previousReaction] || 0) - 1);
    }

    // Set the new reaction
    reactions[userId] = reaction;
    reactionCounts[reaction] = (reactionCounts[reaction] || 0) + 1;

    const updated: Promo = {
      ...existing,
      reactions,
      reactionCounts,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(promoId, updated);
    return updated;
  }

  async removeReaction(promoId: string, userId: string): Promise<Promo> {
    const existing = this.store.get(promoId);
    if (!existing) throw new NotFoundError('Promo', promoId);

    const reactions = { ...existing.reactions };
    const reactionCounts = { ...existing.reactionCounts };

    const previousReaction = reactions[userId];
    if (previousReaction) {
      reactionCounts[previousReaction] = Math.max(0, (reactionCounts[previousReaction] || 0) - 1);
      delete reactions[userId];
    }

    const updated: Promo = {
      ...existing,
      reactions,
      reactionCounts,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(promoId, updated);
    return updated;
  }
}
