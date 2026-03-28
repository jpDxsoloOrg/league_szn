import { useState, useCallback, useMemo } from 'react';
import type { PromoWithContext } from '../types/promo';

const STORAGE_KEY = 'league_szn_read_promos';
const MAX_READ_IDS = 500;

interface PromoReadState {
  readIds: string[];
  lastClearedAt: string | null;
}

function loadState(): PromoReadState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { readIds: [], lastClearedAt: null };
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'readIds' in parsed &&
      Array.isArray((parsed as PromoReadState).readIds)
    ) {
      return parsed as PromoReadState;
    }
    return { readIds: [], lastClearedAt: null };
  } catch {
    return { readIds: [], lastClearedAt: null };
  }
}

function saveState(state: PromoReadState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function usePromoReadState() {
  const [state, setState] = useState<PromoReadState>(loadState);

  const readIdSet = useMemo(() => new Set(state.readIds), [state.readIds]);

  const isRead = useCallback(
    (promoId: string, createdAt: string): boolean => {
      if (readIdSet.has(promoId)) return true;
      if (state.lastClearedAt && createdAt <= state.lastClearedAt) return true;
      return false;
    },
    [readIdSet, state.lastClearedAt]
  );

  const markAsRead = useCallback((promoId: string) => {
    setState((prev) => {
      if (prev.readIds.includes(promoId)) return prev;
      const newIds = [...prev.readIds, promoId];
      // Trim oldest if over cap
      const trimmed = newIds.length > MAX_READ_IDS
        ? newIds.slice(newIds.length - MAX_READ_IDS)
        : newIds;
      const next = { ...prev, readIds: trimmed };
      saveState(next);
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    const next: PromoReadState = {
      readIds: [],
      lastClearedAt: new Date().toISOString(),
    };
    saveState(next);
    setState(next);
  }, []);

  const unreadCount = useCallback(
    (promos: PromoWithContext[]): number => {
      return promos.filter((p) => !isRead(p.promoId, p.createdAt)).length;
    },
    [isRead]
  );

  return { isRead, markAsRead, markAllAsRead, unreadCount };
}
