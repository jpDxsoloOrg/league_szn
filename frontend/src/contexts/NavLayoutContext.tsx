import { useState, useEffect, useCallback, ReactNode } from 'react';
import { NAV_LAYOUT_STORAGE_KEY, type NavLayoutMode } from './navLayoutTypes';
import { NavLayoutContext, readStoredMode } from './navLayoutContext';

export function NavLayoutProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<NavLayoutMode>(() => readStoredMode());

  useEffect(() => {
    try {
      localStorage.setItem(NAV_LAYOUT_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  const setMode = useCallback((next: NavLayoutMode) => {
    setModeState(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => (prev === 'sidebar' ? 'topnav' : 'sidebar'));
  }, []);

  return (
    <NavLayoutContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </NavLayoutContext.Provider>
  );
}
