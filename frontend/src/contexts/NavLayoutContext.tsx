import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type NavLayoutMode = 'sidebar' | 'topnav';

const STORAGE_KEY = 'league_szn_nav_layout';

interface NavLayoutContextType {
  mode: NavLayoutMode;
  setMode: (mode: NavLayoutMode) => void;
  toggleMode: () => void;
}

const NavLayoutContext = createContext<NavLayoutContextType | undefined>(undefined);

function readStoredMode(): NavLayoutMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'sidebar' || stored === 'topnav') return stored;
  } catch {
    // ignore
  }
  return 'sidebar';
}

export function NavLayoutProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<NavLayoutMode>(() => readStoredMode());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
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

export function useNavLayout(): NavLayoutContextType {
  const ctx = useContext(NavLayoutContext);
  if (ctx === undefined) {
    throw new Error('useNavLayout must be used within NavLayoutProvider');
  }
  return ctx;
}
