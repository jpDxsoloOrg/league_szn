import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSiteConfig } from '../contexts/SiteConfigContext';
import { useNavLayout } from '../contexts/navLayoutContext';
import LanguageSwitcher from './LanguageSwitcher';
import {
  USER_NAV_GROUPS,
  USER_NAV_STANDALONE,
  ADMIN_NAV_GROUPS,
  getUserGroupForPath,
  getAdminGroupForPath,
  type NavItem,
} from '../config/navConfig';
import type { SiteFeatures } from '../services/api';
import './TopNav.css';

function isUserItemVisible(
  item: NavItem,
  features: SiteFeatures,
  isWrestler: boolean,
  isFantasy: boolean
): { show: boolean; disabled: boolean; disabledLabel?: string } {
  if (item.feature && !features[item.feature]) return { show: false, disabled: false };
  if (item.role === 'Wrestler') {
    return { show: true, disabled: !isWrestler, disabledLabel: item.roleLockedLabel };
  }
  if (item.role === 'Fantasy' || (item as { type?: string }).type === 'fantasy') {
    return { show: true, disabled: !isFantasy, disabledLabel: (item as { comingSoonLabel?: string }).comingSoonLabel };
  }
  return { show: true, disabled: false };
}

function showWrestlerGroup(features: SiteFeatures, isWrestler: boolean): boolean {
  return isWrestler || features.challenges || features.promos;
}

const MOBILE_BREAKPOINT = 768;

export default function TopNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isAuthenticated, isAdminOrModerator, isSuperAdmin, isWrestler, isFantasy, signOut } = useAuth();
  const { features } = useSiteConfig();
  const { setMode: setNavLayout } = useNavLayout();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ core: true, admin: true });
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT);
  const navRef = useRef<HTMLDivElement>(null);

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      const group = getAdminGroupForPath(location.pathname);
      if (group) setExpandedGroups((prev) => ({ ...prev, [group]: true }));
    } else {
      const group = getUserGroupForPath(location.pathname);
      if (group) setExpandedGroups((prev) => ({ ...prev, [group]: true }));
    }
  }, [location.pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenGroup(null);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  const closeDropdown = useCallback(() => setOpenGroup(null), []);

  useEffect(() => {
    if (openGroup === null) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [openGroup, closeDropdown]);

  const isActive = (path: string) => location.pathname === path;
  const isActivePrefix = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const handleLogout = async () => {
    await signOut();
  };

  function renderUserItem(item: NavItem) {
    const { show, disabled, disabledLabel } = isUserItemVisible(item, features, isWrestler, isFantasy);
    if (!show) return null;
    if (disabled && disabledLabel) {
      return (
        <span key={item.path} className="topnav-item-disabled">
          {t(item.i18nKey)} <span className="topnav-item-badge">{disabledLabel}</span>
        </span>
      );
    }
    const usePrefix = ['/stats', '/events', '/contenders'].includes(item.path);
    const active = usePrefix ? isActivePrefix(item.path) : (item.path === '/' ? isActive('/') : isActive(item.path));
    return (
      <Link key={item.path} to={item.path} className={active ? 'active' : ''} onClick={closeDropdown}>
        {t(item.i18nKey)}
      </Link>
    );
  }

  function renderStandaloneItem(item: (NavItem & { type: 'fantasy' | 'link' })) {
    if (item.type === 'fantasy' && !features.fantasy) return null;
    if (item.type === 'link') {
      return (
        <Link key={item.path} to={item.path} className={isActive(item.path) ? 'active' : ''} onClick={closeDropdown}>
          {t(item.i18nKey)}
        </Link>
      );
    }
    const { show, disabled, disabledLabel } = isUserItemVisible(item, features, isWrestler, isFantasy);
    if (!show) return null;
    if (disabled && disabledLabel) {
      return (
        <span key={item.path} className="topnav-item-disabled">
          {t(item.i18nKey)} <span className="topnav-item-badge">{disabledLabel}</span>
        </span>
      );
    }
    return (
      <Link key={item.path} to={item.path} className={location.pathname.startsWith(item.path) ? 'active' : ''} onClick={closeDropdown}>
        {t(item.i18nKey)}
      </Link>
    );
  }

  const sharedNavContent = (
    <>
      {USER_NAV_GROUPS.map((group) => {
        if (group.key === 'wrestler' && !showWrestlerGroup(features, isWrestler)) return null;
        return (
          <div key={group.key} className="topnav-group">
            <button
              type="button"
              className="topnav-group-btn"
              onClick={() => toggleGroup(group.key)}
              aria-expanded={!!expandedGroups[group.key]}
              aria-haspopup="true"
            >
              <span>{t(group.i18nKey)}</span>
              <span className="topnav-arrow">{expandedGroups[group.key] ? '\u25BE' : '\u25B8'}</span>
            </button>
            {expandedGroups[group.key] && (
              <div className="topnav-group-items">
                {group.items.map((item) => renderUserItem(item))}
              </div>
            )}
          </div>
        );
      })}
      {USER_NAV_STANDALONE.map((item) => renderStandaloneItem(item))}
      {isAdminOrModerator && (
        <div className="topnav-group topnav-admin">
          <button
            type="button"
            className="topnav-group-btn"
            onClick={() => toggleGroup('admin')}
            aria-expanded={!!expandedGroups['admin']}
            aria-haspopup="true"
          >
            <span>{t('nav.admin')}</span>
            <span className="topnav-arrow">{expandedGroups['admin'] ? '\u25BE' : '\u25B8'}</span>
          </button>
          {expandedGroups['admin'] && (
            <div className="topnav-group-items topnav-admin-items">
              {ADMIN_NAV_GROUPS.map((sub) => (
                <div key={sub.key} className="topnav-subgroup">
                  <span className="topnav-subgroup-label">{t(sub.i18nKey)}</span>
                  {sub.items.map((item) => {
                    if (item.danger && !isSuperAdmin) return null;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`topnav-admin-link ${item.danger ? 'danger-link' : ''} ${isActive(item.path) ? 'active' : ''}`}
                        onClick={closeDropdown}
                      >
                        {t(item.i18nKey)}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <div className="topnav topnav-mobile" ref={navRef}>
        <div className="topnav-bar">
          <h2 className="topnav-title">{t('header.title')}</h2>
          <div className="topnav-bar-right">
            <LanguageSwitcher />
            <button
              type="button"
              className="topnav-hamburger"
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              <span className={`topnav-hamburger-icon ${mobileMenuOpen ? 'open' : ''}`}>
                <span />
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <>
            <div className="topnav-overlay" onClick={() => setMobileMenuOpen(false)} />
            <div className="topnav-dropdown topnav-mobile-dropdown">
              {sharedNavContent}
              <div className="topnav-auth">
                <button type="button" className="topnav-layout-btn" onClick={() => { setNavLayout('sidebar'); setMobileMenuOpen(false); }}>
                  {t('nav.switchToSidebar')}
                </button>
                {isAuthenticated ? (
                  <button type="button" className="topnav-logout" onClick={() => { handleLogout(); setMobileMenuOpen(false); }}>
                    {t('common.logout')}
                  </button>
                ) : (
                  <>
                    <Link to="/login" className={isActive('/login') ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>{t('common.signIn')}</Link>
                    <Link to="/signup" className={isActive('/signup') ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>{t('common.signUp')}</Link>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="topnav" ref={navRef}>
      <div className="topnav-bar">
        <h2 className="topnav-title">{t('header.title')}</h2>
        <nav className="topnav-menu" aria-label="Main navigation">
          {USER_NAV_GROUPS.map((group) => {
            if (group.key === 'wrestler' && !showWrestlerGroup(features, isWrestler)) return null;
            const isOpen = openGroup === group.key;
            return (
              <div key={group.key} className="topnav-dropdown-wrap">
                <button
                  type="button"
                  className="topnav-menu-btn"
                  onClick={() => setOpenGroup(isOpen ? null : group.key)}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                >
                  {t(group.i18nKey)}
                  <span className="topnav-arrow">{'\u25BE'}</span>
                </button>
                {isOpen && (
                  <div className="topnav-flyout" role="menu">
                    {group.items.map((item) => {
                      const { show, disabled, disabledLabel } = isUserItemVisible(item, features, isWrestler, isFantasy);
                      if (!show) return null;
                      if (disabled && disabledLabel) {
                        return (
                          <span key={item.path} className="topnav-item-disabled" role="none">
                            {t(item.i18nKey)} <span className="topnav-item-badge">{disabledLabel}</span>
                          </span>
                        );
                      }
                      const usePrefix = ['/stats', '/events', '/contenders'].includes(item.path);
                      const active = usePrefix ? isActivePrefix(item.path) : (item.path === '/' ? isActive('/') : isActive(item.path));
                      return (
                        <Link key={item.path} to={item.path} role="menuitem" className={active ? 'active' : ''} onClick={closeDropdown}>
                          {t(item.i18nKey)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {USER_NAV_STANDALONE.filter((item) => (item.type === 'fantasy' ? features.fantasy : true)).map((item) => {
            if (item.type === 'link') {
              return (
                <Link key={item.path} to={item.path} className={`topnav-menu-link ${isActive(item.path) ? 'active' : ''}`}>
                  {t(item.i18nKey)}
                </Link>
              );
            }
            const { disabled } = isUserItemVisible(item, features, isWrestler, isFantasy);
            if (disabled) {
              return (
                <span key={item.path} className="topnav-menu-link topnav-item-disabled">
                  {t(item.i18nKey)}
                </span>
              );
            }
            return (
              <Link key={item.path} to={item.path} className={`topnav-menu-link ${location.pathname.startsWith(item.path) ? 'active' : ''}`}>
                {t(item.i18nKey)}
              </Link>
            );
          })}
          {isAdminOrModerator && (
            <div className="topnav-dropdown-wrap">
              <button
                type="button"
                className="topnav-menu-btn"
                onClick={() => setOpenGroup(openGroup === 'admin' ? null : 'admin')}
                aria-expanded={openGroup === 'admin'}
                aria-haspopup="true"
              >
                {t('nav.admin')}
                <span className="topnav-arrow">{'\u25BE'}</span>
              </button>
              {openGroup === 'admin' && (
                <div className="topnav-flyout topnav-flyout-admin" role="menu">
                  {ADMIN_NAV_GROUPS.map((sub) => (
                    <div key={sub.key} className="topnav-flyout-subgroup">
                      <span className="topnav-flyout-label">{t(sub.i18nKey)}</span>
                      {sub.items.map((item) => {
                        if (item.danger && !isSuperAdmin) return null;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            role="menuitem"
                            className={`${item.danger ? 'danger-link' : ''} ${isActive(item.path) ? 'active' : ''}`}
                            onClick={closeDropdown}
                          >
                            {t(item.i18nKey)}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
        <div className="topnav-bar-right">
          <LanguageSwitcher />
          <button
            type="button"
            className="topnav-layout-btn"
            onClick={() => setNavLayout('sidebar')}
            aria-label="Switch to sidebar menu"
          >
            {t('nav.switchToSidebar')}
          </button>
          {isAuthenticated ? (
            <button type="button" className="topnav-logout" onClick={handleLogout}>
              {t('common.logout')}
            </button>
          ) : (
            <>
              <Link to="/login" className={`topnav-menu-link ${isActive('/login') ? 'active' : ''}`}>{t('common.signIn')}</Link>
              <Link to="/signup" className={`topnav-menu-link ${isActive('/signup') ? 'active' : ''}`}>{t('common.signUp')}</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
