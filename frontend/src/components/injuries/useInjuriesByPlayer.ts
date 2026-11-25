import { useEffect, useState } from 'react';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { playersApi } from '../../services/api';
import type { PublicCurrentInjury } from '../../types/injury';
import { activeInjury } from './injuryDisplay';

const EMPTY: ReadonlyMap<string, PublicCurrentInjury> = new Map();

/**
 * Every player who is injured right now, by playerId (INJ-12), for screens
 * whose rows carry no player record, such as match cards. Loads the public
 * roster once; empty while the injuries feature is off, `wanted` is false,
 * or the request fails.
 */
export function useInjuriesByPlayer(wanted = true): ReadonlyMap<string, PublicCurrentInjury> {
  const { features } = useSiteConfig();
  const enabled = Boolean(features.injuries) && wanted;
  const [injuries, setInjuries] = useState<ReadonlyMap<string, PublicCurrentInjury>>(EMPTY);

  useEffect(() => {
    setInjuries(EMPTY);
    if (!enabled) return undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const players = await playersApi.getAll(controller.signal);
        if (controller.signal.aborted) return;
        const now = new Date();
        const injured = new Map<string, PublicCurrentInjury>();
        for (const player of players) {
          const injury = activeInjury(player.currentInjury, now);
          if (injury) injured.set(player.playerId, injury);
        }
        setInjuries(injured);
      } catch {
        // The badges are extra information; the card stays usable without them.
      }
    };
    void load();
    return () => controller.abort();
  }, [enabled]);

  return enabled ? injuries : EMPTY;
}
