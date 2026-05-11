import { useState, useEffect, useCallback, ReactNode } from 'react';
import { MENU_MODE_STORAGE_KEY, type MenuMode } from './menuModeTypes';
import { MenuModeContext, readStoredMenuMode } from './menuModeContext';

export function MenuModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<MenuMode>(() => readStoredMenuMode());

  useEffect(() => {
    try {
      localStorage.setItem(MENU_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  const setMode = useCallback((next: MenuMode) => {
    setModeState(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => (prev === 'basic' ? 'advanced' : 'basic'));
  }, []);

  return (
    <MenuModeContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </MenuModeContext.Provider>
  );
}
