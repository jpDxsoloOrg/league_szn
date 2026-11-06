import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import { useNavContext } from '../../hooks/useNavContext';
import { findSectionForPath, getSectionLandingPath, getVisibleSections } from '../../config/navConfig';
import './BottomTabBar.css';

/** Fixed tab bar with the same sections as the desktop header. */
export default function BottomTabBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navContext = useNavContext();

  // Admin hangs off the Me hub on phones, so its pages keep Me highlighted.
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const activeKey = isAdminPath ? 'me' : findSectionForPath(pathname)?.key;

  return (
    <nav className="bottom-tab-bar" aria-label={t('mobileNav.ariaLabel')}>
      {getVisibleSections(navContext).map((section) => {
        const active = section.key === activeKey;
        const isSignIn = section.key === 'me' && !navContext.isAuthenticated;
        const Icon = isSignIn ? LogIn : section.icon;
        return (
          <Link
            key={section.key}
            to={getSectionLandingPath(section, navContext)}
            className={`bottom-tab-bar__item ${active ? 'bottom-tab-bar__item--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon aria-hidden="true" className="bottom-tab-bar__icon" size={24} />
            <span className="bottom-tab-bar__label">{t(isSignIn ? 'common.signIn' : section.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
