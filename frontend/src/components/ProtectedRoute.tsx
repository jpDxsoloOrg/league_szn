import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LockKeyhole, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../services/cognito';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import PageHeader from './ui/PageHeader';
import Skeleton from './ui/Skeleton';
import './ProtectedRoute.css';

/** Translation keys for the page a guest sees in place of the sign-in redirect. */
export interface GuestPrompt {
  pageTitleKey: string;
  titleKey: string;
  descriptionKey: string;
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  fallback?: string;
  /**
   * For pages reachable from public navigation: a guest stays on the URL, so the
   * section nav stays put, and is told why they need to sign in. The access
   * rule is the same either way.
   */
  guestPrompt?: GuestPrompt;
}

export default function ProtectedRoute({ children, requiredRole, fallback = '/login', guestPrompt }: ProtectedRouteProps) {
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

  if (!isAuthenticated && guestPrompt) {
    return (
      <>
        <PageHeader title={t(guestPrompt.pageTitleKey)} />
        <section className="protected-route__prompt">
          <LockKeyhole aria-hidden="true" size={32} className="protected-route__prompt-icon" />
          <h2 className="protected-route__prompt-title">{t(guestPrompt.titleKey)}</h2>
          <p className="protected-route__prompt-text">{t(guestPrompt.descriptionKey)}</p>
          <div className="protected-route__prompt-actions">
            <Button to={fallback} linkState={{ from: location }}>{t('common.signIn')}</Button>
            <Button to="/signup" variant="secondary">{t('common.signUp')}</Button>
          </div>
        </section>
      </>
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
