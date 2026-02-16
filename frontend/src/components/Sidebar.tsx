import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSiteConfig } from '../contexts/SiteConfigContext';
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
import './Sidebar.css';

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

export default function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isAuthenticated, isAdminOrModerator, isSuperAdmin, isWrestler, isFantasy, signOut } = useAuth();
  const { features } = useSiteConfig();
  const [adminExpanded, setAdminExpanded] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ core: true });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }, []);

  // Auto-expand the relevant sub-group when navigating
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setAdminExpanded(true);
      const group = getAdminGroupForPath(location.pathname);
      if (group) {
        setExpandedGroups(prev => ({ ...prev, [group]: true }));
      }
    } else {
      const group = getUserGroupForPath(location.pathname);
      if (group) {
        setExpandedGroups(prev => ({ ...prev, [group]: true }));
      }
    }
  }, [location.pathname]);

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => setCollapsed((prev) => !prev), []);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const handleLogout = async () => {
    await signOut();
  };

  const isActive = (path: string) => location.pathname === path;
  const isActivePrefix = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <>
    <button
      className="hamburger-btn"
      onClick={toggleMobile}
      aria-label="Toggle navigation"
    >
      <span className={`hamburger-icon ${mobileOpen ? 'open' : ''}`}>
        <span />
        <span />
        <span />
      </span>
    </button>

    {mobileOpen && (
      <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
    )}

    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t('nav.switchToSidebar') : 'Collapse sidebar'}
          title={collapsed ? t('nav.switchToSidebar') : 'Collapse sidebar'}
        >
          <span className="collapse-label">{collapsed ? '\u203A' : '\u2039'}</span>
        </button>
        <h2>{t('header.title')}</h2>
        <LanguageSwitcher />
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          {USER_NAV_GROUPS.map((group) => {
            if (group.key === 'wrestler' && !showWrestlerGroup(features, isWrestler)) return null;
            return (
              <div key={group.key} className="nav-subgroup user-nav-subgroup">
                <button
                  type="button"
                  className="nav-subgroup-toggle user-nav-toggle"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={!!expandedGroups[group.key]}
                >
                  <span>{t(group.i18nKey)}</span>
                  <span className="toggle-arrow">{expandedGroups[group.key] ? '\u25BE' : '\u25B8'}</span>
                </button>
                {expandedGroups[group.key] && (
                  <div className="nav-subgroup-items user-nav-items">
                    {group.items.map((item) => {
                      const { show, disabled, disabledLabel } = isUserItemVisible(item, features, isWrestler, isFantasy);
                      if (!show) return null;
                      if (disabled && disabledLabel) {
                        return (
                          <span key={item.path} className="nav-disabled">
                            {t(item.i18nKey)} <span className={item.role === 'Wrestler' ? 'role-locked' : 'coming-soon'}>{disabledLabel}</span>
                          </span>
                        );
                      }
                      const usePrefix = ['/stats', '/events', '/contenders'].includes(item.path);
                      const active = usePrefix ? isActivePrefix(item.path) : (item.path === '/' ? isActive('/') : isActive(item.path));
                      return (
                        <Link key={item.path} to={item.path} className={active ? 'active' : ''}>
                          {t(item.i18nKey)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {USER_NAV_STANDALONE.map((item) => {
            if (item.type === 'fantasy' && !features.fantasy) return null;
            if (item.type === 'link') {
              return (
                <Link key={item.path} to={item.path} className={isActive(item.path) ? 'active' : ''}>
                  {t(item.i18nKey)}
                </Link>
              );
            }
            const { show, disabled, disabledLabel } = isUserItemVisible(item, features, isWrestler, isFantasy);
            if (!show) return null;
            if (disabled && disabledLabel) {
              return (
                <span key={item.path} className="nav-disabled">
                  {t(item.i18nKey)} <span className="coming-soon">{disabledLabel}</span>
                </span>
              );
            }
            return (
              <Link key={item.path} to={item.path} className={location.pathname.startsWith(item.path) ? 'active' : ''}>
                {t(item.i18nKey)}
              </Link>
            );
          })}
        </div>

        {isAdminOrModerator && (
          <div className="nav-section admin-section">
            <button
              className={`nav-section-toggle ${adminExpanded ? 'expanded' : ''}`}
              onClick={() => setAdminExpanded(!adminExpanded)}
            >
              <span>{t('nav.admin')}</span>
              <span className="toggle-arrow">{adminExpanded ? '\u25B2' : '\u25BC'}</span>
            </button>

            {adminExpanded && (
              <div className="admin-nav-items">
                {ADMIN_NAV_GROUPS.map((group) => (
                  <div key={group.key} className="nav-subgroup">
                    <button
                      type="button"
                      className="nav-subgroup-toggle"
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={!!expandedGroups[group.key]}
                    >
                      <span>{t(group.i18nKey)}</span>
                      <span className="toggle-arrow">{expandedGroups[group.key] ? '\u25BE' : '\u25B8'}</span>
                    </button>
                    {expandedGroups[group.key] && (
                      <div className="nav-subgroup-items">
                        {group.items.map((item) => {
                          if (item.danger && !isSuperAdmin) return null;
                          return (
                            <Link
                              key={item.path}
                              to={item.path}
                              className={`${item.danger ? 'danger-link ' : ''}${isActive(item.path) ? 'active' : ''}`}
                            >
                              {t(item.i18nKey)}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="nav-section auth-section">
          {isAuthenticated ? (
            <button className="sidebar-logout" onClick={handleLogout}>
              {t('common.logout')}
            </button>
          ) : (
            <>
              <Link to="/login" className={isActive('/login') ? 'active' : ''}>
                Sign In
              </Link>
              <Link to="/signup" className={isActive('/signup') ? 'active' : ''}>
                Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>
    </aside>
    </>
  );
}
