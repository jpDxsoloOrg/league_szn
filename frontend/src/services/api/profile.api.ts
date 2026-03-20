import type { Player, Season } from '../../types';
import { API_BASE_URL, fetchWithAuth } from './apiClient';
import { playersApi } from './players.api';
import { seasonsApi } from './seasons.api';
import { standingsApi } from './standings.api';

export const profileApi = {
  getMyProfile: async (signal?: AbortSignal): Promise<Player> => {
    // Dev mode: build full profile from public APIs since /players/me requires real auth
    if (import.meta.env.DEV) {
      const devPlayer = sessionStorage.getItem('devPlayer');
      if (devPlayer) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const { playerId } = JSON.parse(devPlayer);
        if (playerId) {
          const [all, seasons] = await Promise.all([
            playersApi.getAll(signal),
            seasonsApi.getAll(signal),
          ]);
          const player = all.find((p: Player) => p.playerId === playerId);
          if (player) {
            // Build season records from standings
            const seasonRecords = await Promise.all(
              seasons.map(async (season: Season) => {
                const standings = await standingsApi.get(season.seasonId, signal);
                const entry = standings.players?.find((p: Player) => p.playerId === playerId);
                return {
                  seasonId: season.seasonId,
                  seasonName: season.name || 'Unknown Season',
                  seasonStatus: season.status || 'unknown',
                  wins: entry?.wins ?? 0,
                  losses: entry?.losses ?? 0,
                  draws: entry?.draws ?? 0,
                };
              })
            );
            return { ...player, seasonRecords } as Player;
          }
        }
      }
    }
    return fetchWithAuth(`${API_BASE_URL}/players/me`, {}, signal);
  },

  updateMyProfile: async (updates: {
    name?: string;
    currentWrestler?: string;
    imageUrl?: string;
    psnId?: string;
  }): Promise<Player> => {
    return fetchWithAuth(`${API_BASE_URL}/players/me`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },
};
