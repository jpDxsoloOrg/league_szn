import { API_BASE_URL, fetchWithAuth } from './apiClient';

/** Users per bulk request; the API refuses more. */
export const BULK_USERS_MAX = 50;

export type BulkUserAction = 'enable' | 'disable' | 'addRole' | 'removeRole' | 'delete';
export type BulkUserRole = 'Wrestler' | 'Moderator';

export interface BulkUserResult {
  username: string;
  ok: boolean;
  /** Set when ok is false, e.g. USER_ENABLED, PLAYER_DEACTIVATED, DISCIPLINE_ACTIVE, SELF, ERROR. */
  code?: string;
  message?: string;
}

export const usersApi = {
  list: async (signal?: AbortSignal): Promise<{
    users: Array<{
      username: string;
      sub: string;
      email: string;
      name: string;
      wrestlerName: string;
      psnId: string;
      playerName: string;
      status: string;
      enabled: boolean;
      created: string;
      groups: string[];
    }>;
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/users`, {}, signal);
  },

  updateRole: async (username: string, role: string, action: 'promote' | 'demote'): Promise<{
    message: string;
    username: string;
    groups: string[];
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/users/role`, {
      method: 'POST',
      body: JSON.stringify({ username, role, action }),
    });
  },

  toggleEnabled: async (username: string, enabled: boolean): Promise<{
    message: string;
    username: string;
    enabled: boolean;
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/users/toggle-enabled`, {
      method: 'POST',
      body: JSON.stringify({ username, enabled }),
    });
  },

  /**
   * Backfill every player's `hasWrestlerRole` from Cognito group membership.
   * Until this runs, unsynced players stay visible on roster screens.
   */
  syncRoles: async (): Promise<{
    message: string;
    totalPlayers: number;
    granted: number;
    revoked: number;
    unchanged: number;
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/users/sync-roles`, {
      method: 'POST',
    });
  },

  /** One action on up to BULK_USERS_MAX accounts, with a result per account. */
  bulk: async (action: BulkUserAction, usernames: string[], role?: BulkUserRole): Promise<{
    action: BulkUserAction;
    results: BulkUserResult[];
    succeeded: number;
    failed: number;
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/users/bulk`, {
      method: 'POST',
      body: JSON.stringify({ action, usernames, ...(role ? { role } : {}) }),
    });
  },

  deleteUser: async (username: string): Promise<{
    message: string;
    username: string;
  }> => {
    return fetchWithAuth(`${API_BASE_URL}/admin/users/delete`, {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  },
};
