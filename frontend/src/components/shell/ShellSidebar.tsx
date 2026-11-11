import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import Wordmark from './Wordmark';
import { useNavContext } from '../../hooks/useNavContext';
import {
  ADMIN_NAV_ICON,
  findActiveTab,
  getActiveSectionKey,
  getVisibleSections,
  getVisibleTabs,
  isAdminPath,
} from '../../config/navConfig';
import type { NavSection } from '../../config/navConfig';
import './ShellSidebar.css';

const AdminIcon = ADMIN_NAV_ICON;

function itemClass(active: boolean): string {
  return active ? 'shell-sidebar__link shell-sidebar__link--active' : 'shell-sidebar__link';
}

/**
 * Desktop navigation rail: the wordmark, then every section with its pages
 * listed under it, so any page is one click away. Role-gated Admin comes last.
 */
export default function ShellSidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navContext = useNavContext();

  const adminActive = isAdminPath(pathname);
  const activeKey = adminActive ? undefined : getActiveSectionKey(pathname, navContext.isAuthenticated);

  const renderSection = (section: NavSection) => {
    const tabs = getVisibleTabs(section, navContext);
    const activeTab = section.key === activeKey ? findActiveTab(tabs, pathname) : null;
    const isMe = section.key === 'me';
    const hubActive = isMe && section.key === activeKey && !activeTab;
    const headingId = `shell-sidebar-${section.key}`;

    return (
      <li key={section.key} className="shell-sidebar__section">
        <h2 id={headingId} className="shell-sidebar__heading">{t(section.labelKey)}</h2>
        <ul className="shell-sidebar__list" aria-labelledby={headingId}>
          {isMe && (
            <li>
              {navContext.isAuthenticated ? (
                <Link to={section.path} className={itemClass(hubActive)} aria-current={hubActive ? 'page' : undefined}>
                  <section.icon aria-hidden="true" size={18} />
                  {t('nav.sections.me')}
                </Link>
              ) : (
                <Link to="/login" className={itemClass(hubActive)} aria-current={hubActive ? 'page' : undefined}>
                  <LogIn aria-hidden="true" size={18} />
                  {t('common.signIn')}
                </Link>
              )}
            </li>
          )}
          {tabs.map((tab) => {
            const active = tab.path === activeTab?.path;
            return (
              <li key={tab.path}>
                <Link to={tab.path} className={itemClass(active)} aria-current={active ? 'page' : undefined}>
                  {tab.icon && <tab.icon aria-hidden="true" size={18} />}
                  {t(tab.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </li>
    );
  };

  return (
    <aside className="shell-sidebar">
      <div className="shell-sidebar__brand">
        <Wordmark />
      </div>
      <nav className="shell-sidebar__nav" aria-label={t('mobileNav.ariaLabel')}>
        <ul className="shell-sidebar__sections">
          {getVisibleSections(navContext).map(renderSection)}
          {navContext.isAdminOrModerator && (
            <li className="shell-sidebar__section">
              <ul className="shell-sidebar__list">
                <li>
                  <Link to="/admin" className={itemClass(adminActive)} aria-current={adminActive ? 'page' : undefined}>
                    <AdminIcon aria-hidden="true" size={18} />
                    {t('nav.admin')}
                  </Link>
                </li>
              </ul>
            </li>
          )}
        </ul>
      </nav>
    </aside>
  );
}
