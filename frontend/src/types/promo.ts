export type PromoType =
  | 'open-mic'
  | 'call-out'
  | 'response'
  | 'pre-match'
  | 'post-match'
  | 'championship'
  | 'return';

export type ReactionType = 'fire' | 'mic' | 'trash' | 'mind-blown' | 'clap';

export interface Promo {
  promoId: string;
  playerId: string;
  promoType: PromoType;
  title?: string;
  content: string;
  targetPlayerId?: string;
  targetPromoId?: string;
  matchId?: string;
  championshipId?: string;
  imageUrl?: string;
  reactions: Record<string, ReactionType>;
  reactionCounts: Record<ReactionType, number>;
  isPinned: boolean;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromoWithContext extends Promo {
  playerName: string;
  wrestlerName: string;
  playerImageUrl?: string;
  targetPlayerName?: string;
  targetWrestlerName?: string;
  targetPromo?: Promo;
  matchName?: string;
  championshipName?: string;
  responseCount: number;
}

export interface CreatePromoInput {
  promoType: PromoType;
  title?: string;
  content: string;
  targetPlayerId?: string;
  targetPromoId?: string;
  matchId?: string;
  championshipId?: string;
}
