import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import NotificationBell from '../NotificationBell';
import { getPageInfo } from '../../config/navConfig';
import './MobileHeader.css';

/**
 * Slim fixed top bar for the mobile app shell: current screen title on the
 * left (derived from the same path→title logic as the desktop TopBar) and the
 * notification bell on the right. NotificationBell gates itself on auth and
 * the `notifications` feature flag, so it can be mounted unconditionally.
 */
export default function MobileHeader() {
  const { t } = useTranslation();
  const location = useLocation();

  const { title } = getPageInfo(location.pathname, t);

  return (
    <header className="mobile-header">
      <h1 className="mobile-header__title">{title}</h1>
      <div className="mobile-header__actions">
        <NotificationBell />
      </div>
    </header>
  );
}
