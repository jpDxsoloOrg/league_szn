import { createContext, useContext } from 'react';
import { MENU_MODE_STORAGE_KEY, type MenuMode } from './menuModeTypes';

export interface MenuModeContextType {
  mode: MenuMode;
  setMode: (mode: MenuMode) => void;
  toggleMode: () => void;
}

export const MenuModeContext = createContext<MenuModeContextType | undefined>(undefined);

export function readStoredMenuMode(): MenuMode {
  try {
    const stored = localStorage.getItem(MENU_MODE_STORAGE_KEY);
    if (stored === 'basic' || stored === 'advanced') return stored;
  } catch {
    // ignore
  }
  return 'advanced';
}

export function useMenuMode(): MenuModeContextType {
  const ctx = useContext(MenuModeContext);
  if (ctx === undefined) {
    throw new Error('useMenuMode must be used within MenuModeProvider');
  }
  return ctx;
}
