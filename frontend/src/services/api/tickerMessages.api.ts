import type { TickerMessage } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

/** The most characters a ticker message may have. Matches the backend. */
export const TICKER_TEXT_MAX_LENGTH = 140;

export interface CreateTickerMessageInput {
  text: string;
  href?: string;
  pinned?: boolean;
  /** Defaults to now on the server. */
  startsAt?: string;
  expiresAt: string;
}

export interface UpdateTickerMessageInput {
  text?: string;
  /** null removes the link. */
  href?: string | null;
  pinned?: boolean;
  startsAt?: string;
  expiresAt?: string;
}

export const tickerMessagesApi = {
  getAll: async (signal?: AbortSignal): Promise<TickerMessage[]> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/ticker-messages`, {}, signal);
  },

  create: async (data: CreateTickerMessageInput): Promise<TickerMessage> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/ticker-messages`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: UpdateTickerMessageInput): Promise<TickerMessage> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/ticker-messages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/admin/ticker-messages/${id}`, {
      method: 'DELETE',
    });
  },
};
