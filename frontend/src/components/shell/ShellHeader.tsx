import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleHelp, LogIn } from 'lucide-react';
import LanguageSwitcher from '../LanguageSwitcher';
import NotificationBell from '../NotificationBell';
import SearchLauncher from '../search/SearchLauncher';
import Wordmark from './Wordmark';
import { useNavContext } from '../../hooks/useNavContext';
import {
  ADMIN_NAV_ICON,
  findSectionForPath,
  getSectionLandingPath,
  getVisibleSections,
} from '../../config/navConfig';
import './ShellHeader.css';

const AdminIcon = ADMIN_NAV_ICON;

/** Desktop top bar: the five sections, role-gated Admin, then search and utilities. */
export default function ShellHeader() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navContext = useNavContext();

  const activeKey = findSectionForPath(pathname)?.key;
  const adminActive = pathname === '/admin' || pathname.startsWith('/admin/');

  return (
    <header className="shell-header">
      <div className="shell-header__inner">
        <Wordmark />
        <nav className="shell-header__nav" aria-label={t('mobileNav.ariaLabel')}>
          <ul className="shell-header__list">
            {getVisibleSections(navContext).map((section) => {
              const active = !adminActive && section.key === activeKey;
              const isSignIn = section.key === 'me' && !navContext.isAuthenticated;
              return (
                <li key={section.key}>
                  <Link
                    to={isSignIn ? '/login' : getSectionLandingPath(section, navContext)}
                    className={active ? 'shell-header__link shell-header__link--active' : 'shell-header__link'}
                    aria-current={active ? 'page' : undefined}
                  >
                    {isSignIn && <LogIn aria-hidden="true" size={18} />}
                    {t(isSignIn ? 'common.signIn' : section.labelKey)}
                  </Link>
                </li>
              );
            })}
            {navContext.isAdminOrModerator && (
              <li>
                <Link
                  to="/admin"
                  className={adminActive ? 'shell-header__link shell-header__link--active' : 'shell-header__link'}
                  aria-current={adminActive ? 'page' : undefined}
                >
                  <AdminIcon aria-hidden="true" size={18} />
                  {t('nav.admin')}
                </Link>
              </li>
            )}
          </ul>
        </nav>
        <div className="shell-header__tools">
          <SearchLauncher />
          <NotificationBell />
          <LanguageSwitcher />
          <Link to="/guide" className="shell-header__icon-link" aria-label={t('nav.help')}>
            <CircleHelp aria-hidden="true" size={22} />
          </Link>
        </div>
      </div>
    </header>
  );
}
