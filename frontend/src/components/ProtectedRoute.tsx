import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../services/cognito';
import EmptyState from './ui/EmptyState';
import Skeleton from './ui/Skeleton';
import './ProtectedRoute.css';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  fallback?: string;
}

export default function ProtectedRoute({ children, requiredRole, fallback = '/login' }: ProtectedRouteProps) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, hasRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={fallback} replace state={{ from: location }} />;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <EmptyState
        className="protected-route__denied"
        icon={<ShieldAlert aria-hidden="true" size={32} />}
        title={t('common.accessDenied')}
        description={t('me.access.noPermission')}
        actionLabel={t('common.backToHome')}
        onAction={() => navigate('/')}
      />
    );
  }

  return <>{children}</>;
}
