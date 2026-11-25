import { useEffect, useState } from 'react';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { injuriesApi } from '../../services/api/injuries.api';
import type { PlayerCondition } from '../../types/injury';

/**
 * Loads a player's stamina meter (INJ-12). Null while the injuries feature is
 * off, while `allowed` is false (only the player and staff may read it), while
 * loading, or when the request fails.
 */
export function usePlayerCondition(playerId: string | null | undefined, allowed: boolean): PlayerCondition | null {
  const { features } = useSiteConfig();
  const enabled = Boolean(features.injuries) && allowed && Boolean(playerId);
  const [condition, setCondition] = useState<PlayerCondition | null>(null);

  useEffect(() => {
    setCondition(null);
    if (!enabled || !playerId) return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const result = await injuriesApi.getPlayerCondition(playerId, controller.signal);
        if (!controller.signal.aborted) setCondition(result);
      } catch {
        // The meter is extra information; the page stays usable without it.
      }
    };
    void load();
    return () => controller.abort();
  }, [enabled, playerId]);

  return enabled ? condition : null;
}
