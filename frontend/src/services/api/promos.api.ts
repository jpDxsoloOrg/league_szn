import type { PromoWithContext, CreatePromoInput, ReactionType } from '../../types/promo';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const promosApi = {
  getAll: async (filters?: { playerId?: string; promoType?: string; includeHidden?: boolean }, signal?: AbortSignal): Promise<PromoWithContext[]> => {
    const params = new URLSearchParams();
    if (filters?.playerId) params.set('playerId', filters.playerId);
    if (filters?.promoType) params.set('promoType', filters.promoType);
    if (filters?.includeHidden) params.set('includeHidden', 'true');
    const query = params.toString();
    return fetchWithAuth(`${API_BASE_URL}/promos${query ? `?${query}` : ''}`, {}, signal);
  },

  getById: async (promoId: string, signal?: AbortSignal): Promise<{ promo: PromoWithContext; responses: PromoWithContext[] }> => {
    return fetchWithAuth(`${API_BASE_URL}/promos/${promoId}`, {}, signal);
  },

  create: async (input: CreatePromoInput): Promise<PromoWithContext> => {
    return fetchWithAuth(`${API_BASE_URL}/promos`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  react: async (promoId: string, reaction: ReactionType): Promise<{ reactions: Record<string, ReactionType>; reactionCounts: Record<ReactionType, number> }> => {
    return fetchWithAuth(`${API_BASE_URL}/promos/${promoId}/react`, {
      method: 'POST',
      body: JSON.stringify({ reaction }),
    });
  },

  adminUpdate: async (promoId: string, updates: { isPinned?: boolean; isHidden?: boolean }): Promise<PromoWithContext> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/promos/${promoId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (promoId: string): Promise<void> => {
    await fetchWithAuth(`${API_BASE_URL}/admin/promos/${promoId}`, {
      method: 'DELETE',
    });
  },

  bulkDelete: async (body: { isHidden: boolean }): Promise<{ deleted: number; message: string }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/promos/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
