import type { Promo, PromoType, ReactionType } from './types';

export interface PromoCreateInput {
  playerId: string;
  promoType: PromoType;
  title?: string;
  content: string;
  targetPlayerId?: string;
  targetPromoId?: string;
  matchId?: string;
  championshipId?: string;
  imageUrl?: string;
  challengeMode?: 'singles' | 'tag_team';
  challengerTagTeamName?: string;
  targetTagTeamName?: string;
}

export interface PromosRepository {
  findById(promoId: string): Promise<Promo | null>;
  list(): Promise<Promo[]>;
  listByPlayer(playerId: string): Promise<Promo[]>;
  listByType(promoType: PromoType): Promise<Promo[]>;
  listResponsesTo(targetPromoId: string): Promise<Promo[]>;
  create(input: PromoCreateInput): Promise<Promo>;
  update(promoId: string, patch: Partial<Promo>): Promise<Promo>;
  delete(promoId: string): Promise<void>;
  addReaction(promoId: string, userId: string, reaction: ReactionType): Promise<Promo>;
  removeReaction(promoId: string, userId: string): Promise<Promo>;
}
