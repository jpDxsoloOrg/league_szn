/**
 * Response types for the redesigned Faction Detail page (FAC-07 / FAC-08).
 *
 * These are 1:1 mirrors of the backend handler responses. When the backend
 * shape changes, update this file in the same PR — drift here is the most
 * likely failure mode for the service-layer wrappers.
 */

import type { FactionDirectMessage } from './factionMessage';

export type FormResult = 'W' | 'L' | 'D';

export interface CurrentStreak {
  type: FormResult;
  count: number;
}

// ─── Stats (FAC-07) ──────────────────────────────────────────────────

export interface FactionStatsMemberRow {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number;
  recentForm: FormResult[];
  currentStreak: CurrentStreak;
}

export interface FactionStatsMatchTypeRow {
  matchFormat: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface FactionStatsHeadToHeadRow {
  factionId: string;
  factionName: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface FactionStatsTotals {
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number;
  matchCount: number;
  recentForm: FormResult[];
  currentStreak: CurrentStreak;
}

export interface FactionStatsResponse {
  factionId: string;
  factionName: string;
  seasonId: string | null;
  totals: FactionStatsTotals;
  members: FactionStatsMemberRow[];
  matchTypeBreakdown: FactionStatsMatchTypeRow[];
  headToHead: FactionStatsHeadToHeadRow[];
}

// ─── Schedule (FAC-08) ──────────────────────────────────────────────

export interface FactionScheduleParticipant {
  playerId: string;
  playerName: string;
  isFactionMember: boolean;
}

export interface FactionScheduledMatch {
  matchId: string;
  scheduledFor: string;
  matchFormat: string;
  eventId: string | null;
  eventName: string | null;
  location: string | null;
  participants: FactionScheduleParticipant[];
}

export interface FactionScheduleResponse {
  items: FactionScheduledMatch[];
}

// ─── Promos (FAC-08) ────────────────────────────────────────────────

export type FactionPromoFilter =
  | 'all'
  | 'by-faction'
  | 'directed-at-faction'
  | 'featuring-faction';

export type FactionPromoType =
  | 'open-mic'
  | 'call-out'
  | 'response'
  | 'pre-match'
  | 'post-match'
  | 'championship'
  | 'return';

export interface FactionPromoRow {
  promoId: string;
  promoType: FactionPromoType;
  thumbnail: string | null;
  headline: string | null;
  excerpt: string;
  authorPlayerId: string;
  authorPlayerName: string;
  authorWrestlerName: string;
  targetPlayerId: string | null;
  targetPlayerName: string | null;
  targetWrestlerName: string | null;
  date: string;
  viewCount: number | null;
  heatImpact: number | null;
  isReplyable: boolean;
}

export interface FactionPromosResponse {
  items: FactionPromoRow[];
  nextCursor?: string;
}

// ─── Direct messages (FAC-06) ───────────────────────────────────────

export interface DirectMessageThreadSummary {
  partnerPlayerId: string;
  partnerPlayerName: string | null;
  partnerWrestlerName: string | null;
  partnerImageUrl: string | null;
  lastMessage: FactionDirectMessage;
  lastMessageAt: string;
}
