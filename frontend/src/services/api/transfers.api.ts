import type { TransferRequest, TransferRequestWithDetails } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';

export const transfersApi = {
  createRequest: async (data: { toDivisionId: string; reason: string }): Promise<TransferRequest> => {
    return fetchWithAuth(`${API_BASE_URL}/transfers`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getMyRequests: async (): Promise<TransferRequestWithDetails[]> => {
    return fetchWithAuth(`${API_BASE_URL}/transfers/me`);
  },

  getAllRequests: async (status?: string): Promise<TransferRequestWithDetails[]> => {
    const url = status
      ? `${API_BASE_URL}/admin/transfers?status=${encodeURIComponent(status)}`
      : `${API_BASE_URL}/admin/transfers`;
    return fetchWithAuth(url);
  },

  reviewRequest: async (
    requestId: string,
    data: { status: 'approved' | 'rejected'; reviewNote?: string }
  ): Promise<{ requestId: string; status: string; reviewedBy: string; updatedAt: string }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/transfers/${requestId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};
