import { Navigate } from 'react-router-dom';
import { useSiteConfig } from '../contexts/SiteConfigContext';
import type { SiteFeatures } from '../services/api';

interface FeatureRouteProps {
  children: React.ReactNode;
  feature: keyof SiteFeatures;
}

export default function FeatureRoute({ children, feature }: FeatureRouteProps) {
  const { features, isLoading } = useSiteConfig();

  if (isLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!features[feature]) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
