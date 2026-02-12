import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { siteConfigApi, type SiteFeatures } from '../services/api';

interface SiteConfigContextType {
  features: SiteFeatures;
  isLoading: boolean;
  refreshConfig: () => Promise<void>;
}

const DEFAULT_FEATURES: SiteFeatures = {
  fantasy: true,
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
};

const SiteConfigContext = createContext<SiteConfigContextType | undefined>(undefined);

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<SiteFeatures>(DEFAULT_FEATURES);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfig = useCallback(async (mountedCheck?: () => boolean) => {
    try {
      const result = await siteConfigApi.getFeatures();
      if (mountedCheck && !mountedCheck()) return;
      setFeatures({ ...DEFAULT_FEATURES, ...result.features });
    } catch {
      if (mountedCheck && !mountedCheck()) return;
      // On error, default to all features enabled
      setFeatures(DEFAULT_FEATURES);
    }
    if (mountedCheck && !mountedCheck()) return;
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchConfig(() => mounted);

    return () => {
      mounted = false;
    };
  }, [fetchConfig]);

  const refreshConfig = useCallback(async () => {
    await fetchConfig();
  }, [fetchConfig]);

  return (
    <SiteConfigContext.Provider value={{ features, isLoading, refreshConfig }}>
      {children}
    </SiteConfigContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSiteConfig(): SiteConfigContextType {
  const context = useContext(SiteConfigContext);
  if (context === undefined) {
    throw new Error('useSiteConfig must be used within a SiteConfigProvider');
  }
  return context;
}
