import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSiteConfig } from '../contexts/SiteConfigContext';
import type { NavContext } from '../config/navConfig';

/** The auth and feature state the navigation helpers need. */
export function useNavContext(): NavContext {
  const { isAuthenticated, isWrestler, isAdminOrModerator, isSuperAdmin } = useAuth();
  const { features } = useSiteConfig();

  return useMemo(
    () => ({ features, isAuthenticated, isWrestler, isAdminOrModerator, isSuperAdmin }),
    [features, isAuthenticated, isWrestler, isAdminOrModerator, isSuperAdmin],
  );
}
