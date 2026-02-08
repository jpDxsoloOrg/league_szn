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

  const fetchConfig = useCallback(async () => {
    try {
      const result = await siteConfigApi.getFeatures();
      setFeatures({ ...DEFAULT_FEATURES, ...result.features });
    } catch {
      // On error, default to all features enabled
      setFeatures(DEFAULT_FEATURES);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
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

export function useSiteConfig(): SiteConfigContextType {
  const context = useContext(SiteConfigContext);
  if (context === undefined) {
    throw new Error('useSiteConfig must be used within a SiteConfigProvider');
  }
  return context;
}
