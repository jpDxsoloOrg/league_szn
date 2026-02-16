import { useState, useEffect, useCallback, ReactNode } from 'react';
import { NAV_LAYOUT_STORAGE_KEY, type NavLayoutMode } from './navLayoutTypes';
import { NavLayoutContext, readStoredMode } from './navLayoutContext';

const SIDEBAR_COLLAPSED_KEY = 'league_szn_sidebar_collapsed';

function readSidebarCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

export function NavLayoutProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<NavLayoutMode>(() => readStoredMode());
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(readSidebarCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_LAYOUT_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  const setMode = useCallback((next: NavLayoutMode) => {
    setModeState(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => (prev === 'sidebar' ? 'topnav' : 'sidebar'));
  }, []);

  const setSidebarCollapsed = useCallback((value: boolean) => {
    setSidebarCollapsedState(value);
  }, []);

  return (
    <NavLayoutContext.Provider value={{ mode, setMode, toggleMode, sidebarCollapsed, setSidebarCollapsed }}>
      {children}
    </NavLayoutContext.Provider>
  );
}
