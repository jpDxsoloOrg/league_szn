import { useEffect, useState } from 'react';
import { announcementsApi } from '../../services/api';
import type { Announcement } from '../../types';

export interface NewsState {
  items: Announcement[];
  loading: boolean;
  failed: boolean;
}

/** Published news, newest first. Staff publish it from Admin, Announcements. */
export function useNews(): NewsState {
  const [state, setState] = useState<NewsState>({ items: [], loading: true, failed: false });

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const active = await announcementsApi.getActive(controller.signal);
        if (controller.signal.aborted) return;
        const newestFirst = [...active].sort((first, second) => second.createdAt.localeCompare(first.createdAt));
        setState({ items: newestFirst, loading: false, failed: false });
      } catch {
        if (!controller.signal.aborted) setState({ items: [], loading: false, failed: true });
      }
    };

    void load();
    return () => controller.abort();
  }, []);

  return state;
}

/** Priority 3 is what staff pick for news that cannot wait. */
export const BREAKING_PRIORITY = 3;
