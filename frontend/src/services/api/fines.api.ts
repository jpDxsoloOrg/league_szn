import type { MatchNoShow } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';
import type { ShopLedgerEntry } from './shop.api';

/*
 * GM fines and no-shows (ECO-07) and the GM ledger read (ECO-14). Types
 * mirror `backend/functions/economy/fines.ts`, `matches/noShow.ts` and
 * `economy/getPlayerLedger.ts`.
 */

/** Mirrors FINE_REASON_MAX_LENGTH in backend/lib/fines.ts. */
export const FINE_REASON_MAX_LENGTH = 500;
/** Mirrors NO_SHOW_COMPLETED_WINDOW_DAYS: completed matches take a no-show this long after the result. */
export const NO_SHOW_COMPLETED_WINDOW_DAYS = 7;

export type IssueFineInput =
  | { presetKey: string; reason?: string; matchId?: string; requestId?: string }
  | { amount: number; reason: string; matchId?: string; requestId?: string };

export interface FineResult {
  entry: ShopLedgerEntry;
  balance: number;
  alreadyApplied: boolean;
}

export interface RescindFineResult {
  entry: ShopLedgerEntry;
  fine: ShopLedgerEntry;
  balance: number;
  alreadyApplied: boolean;
}

export interface NoShowResult {
  matchId: string;
  playerId: string;
  noShow: MatchNoShow;
  /** The no-show fine (mark) or its refund (undo); null when nothing was posted. */
  entry: ShopLedgerEntry | null;
  balance: number;
  alreadyApplied: boolean;
}

export interface PlayerLedgerPage {
  playerId: string;
  balance: number;
  items: ShopLedgerEntry[];
  nextCursor?: string;
}

export const finesApi = {
  /** POST /players/{playerId}/fines (GM): a preset, or a custom amount with a reason. */
  issue: async (playerId: string, input: IssueFineInput): Promise<FineResult> => {
    return fetchWithAuth(`${API_BASE_URL}/players/${encodeURIComponent(playerId)}/fines`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** POST /fines/{entryId}/rescind (GM): refunds the fine once. */
  rescind: async (entryId: string, note?: string): Promise<RescindFineResult> => {
    return fetchWithAuth(`${API_BASE_URL}/fines/${encodeURIComponent(entryId)}/rescind`, {
      method: 'POST',
      body: JSON.stringify(note ? { note } : {}),
    });
  },

  /** GET /players/{playerId}/ledger (GM): one page, newest first. */
  getPlayerLedger: async (
    playerId: string,
    options: { cursor?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<PlayerLedgerPage> => {
    const params = new URLSearchParams();
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.limit) params.set('limit', String(options.limit));
    const query = params.toString();
    return fetchWithAuth(
      `${API_BASE_URL}/players/${encodeURIComponent(playerId)}/ledger${query ? `?${query}` : ''}`,
      {},
      signal,
    );
  },
};

export const noShowsApi = {
  /** POST /matches/{matchId}/no-show (GM): marks and fines the player once. */
  mark: async (matchId: string, playerId: string, note?: string): Promise<NoShowResult> => {
    return fetchWithAuth(`${API_BASE_URL}/matches/${encodeURIComponent(matchId)}/no-show`, {
      method: 'POST',
      body: JSON.stringify(note ? { playerId, note } : { playerId }),
    });
  },

  /** DELETE /matches/{matchId}/no-show/{playerId} (GM): undoes the mark and refunds the fine. */
  undo: async (matchId: string, playerId: string): Promise<NoShowResult> => {
    return fetchWithAuth(
      `${API_BASE_URL}/matches/${encodeURIComponent(matchId)}/no-show/${encodeURIComponent(playerId)}`,
      { method: 'DELETE' },
    );
  },
};
