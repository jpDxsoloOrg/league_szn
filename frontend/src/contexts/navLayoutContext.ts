import { createContext, useContext } from 'react';
import { NAV_LAYOUT_STORAGE_KEY, type NavLayoutMode } from './navLayoutTypes';

export interface NavLayoutContextType {
  mode: NavLayoutMode;
  setMode: (mode: NavLayoutMode) => void;
  toggleMode: () => void;
}

export const NavLayoutContext = createContext<NavLayoutContextType | undefined>(undefined);

export function readStoredMode(): NavLayoutMode {
  try {
    const stored = localStorage.getItem(NAV_LAYOUT_STORAGE_KEY);
    if (stored === 'sidebar' || stored === 'topnav') return stored;
  } catch {
    // ignore
  }
  return 'sidebar';
}

export function useNavLayout(): NavLayoutContextType {
  const ctx = useContext(NavLayoutContext);
  if (ctx === undefined) {
    throw new Error('useNavLayout must be used within NavLayoutProvider');
  }
  return ctx;
}
