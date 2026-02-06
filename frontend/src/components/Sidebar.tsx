import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../services/api';
import { cognitoAuth } from '../services/cognito';
import LanguageSwitcher from './LanguageSwitcher';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isAdmin, setIsAdmin] = useState(authApi.isAuthenticated());
  const [adminExpanded, setAdminExpanded] = useState(true);

  // Keep admin auth state in sync
  useEffect(() => {
    setIsAdmin(authApi.isAuthenticated());
  }, [isOpen]);

  // Auto-expand admin section when navigating to admin routes
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setAdminExpanded(true);
    }
  }, [location.pathname]);

  // Close sidebar when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isOpen && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Close sidebar on route change
  useEffect(() => {
    onClose();
  }, [location.pathname]);// eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    await cognitoAuth.signOut();
    authApi.clearToken();
    setIsAdmin(false);
    onClose();
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {isOpen && <div className="sidebar-overlay" />}
      <aside ref={sidebarRef} className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>{t('header.title')}</h2>
          <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <Link to="/" className={isActive('/') ? 'active' : ''}>
              {t('nav.standings')}
            </Link>
            <Link to="/championships" className={isActive('/championships') ? 'active' : ''}>
              {t('nav.championships')}
            </Link>
            <Link to="/matches" className={isActive('/matches') ? 'active' : ''}>
              {t('nav.matches')}
            </Link>
            <Link to="/events" className={isActive('/events') || location.pathname.startsWith('/events/') ? 'active' : ''}>
              {t('nav.events')}
            </Link>
            <Link to="/tournaments" className={isActive('/tournaments') ? 'active' : ''}>
              {t('nav.tournaments')}
            </Link>
            <Link to="/contenders" className={isActive('/contenders') || isActive('/contenders/my-status') ? 'active' : ''}>
              {t('nav.contenders')}
            </Link>
            <span className="nav-disabled">
              {t('nav.challenges')} <span className="coming-soon">Coming Soon</span>
            </span>
            <span className="nav-disabled">
              {t('nav.promos')} <span className="coming-soon">Coming Soon</span>
            </span>
            <span className="nav-disabled">
              {t('nav.statistics')} <span className="coming-soon">Coming Soon</span>
            </span>
            <span className="nav-disabled">
              {t('nav.fantasy')} <span className="coming-soon">Coming Soon</span>
            </span>
            <Link to="/guide" className={isActive('/guide') ? 'active' : ''}>
              {t('nav.help')}
            </Link>
          </div>

          {isAdmin && (
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
                  <Link to="/admin/schedule" className={isActive('/admin/schedule') ? 'active' : ''}>
                    {t('admin.panel.tabs.scheduleMatch')}
                  </Link>
                  <Link to="/admin/results" className={isActive('/admin/results') ? 'active' : ''}>
                    {t('admin.panel.tabs.recordResults')}
                  </Link>
                  <Link to="/admin/events" className={isActive('/admin/events') ? 'active' : ''}>
                    {t('admin.panel.tabs.events')}
                  </Link>
                  <Link to="/admin/seasons" className={isActive('/admin/seasons') ? 'active' : ''}>
                    {t('admin.panel.tabs.seasons')}
                  </Link>
                  <Link to="/admin/players" className={isActive('/admin/players') ? 'active' : ''}>
                    {t('admin.panel.tabs.managePlayers')}
                  </Link>
                  <Link to="/admin/divisions" className={isActive('/admin/divisions') ? 'active' : ''}>
                    {t('admin.panel.tabs.divisions')}
                  </Link>
                  <Link to="/admin/championships" className={isActive('/admin/championships') ? 'active' : ''}>
                    {t('admin.panel.tabs.championships')}
                  </Link>
                  <Link to="/admin/tournaments" className={isActive('/admin/tournaments') ? 'active' : ''}>
                    {t('admin.panel.tabs.tournaments')}
                  </Link>
                  <span className="nav-disabled admin-disabled">
                    {t('admin.panel.tabs.challenges')}
                  </span>
                  <span className="nav-disabled admin-disabled">
                    {t('admin.panel.tabs.promos')}
                  </span>
                  <Link to="/admin/contender-config" className={isActive('/admin/contender-config') ? 'active' : ''}>
                    {t('admin.panel.tabs.contenderConfig')}
                  </Link>
                  <span className="nav-disabled admin-disabled">
                    {t('admin.panel.tabs.fantasyShows')}
                  </span>
                  <span className="nav-disabled admin-disabled">
                    {t('admin.panel.tabs.fantasyConfig')}
                  </span>
                  <Link to="/admin/guide" className={isActive('/admin/guide') ? 'active' : ''}>
                    {t('admin.panel.tabs.help')}
                  </Link>
                  <Link to="/admin/danger" className={`danger-link ${isActive('/admin/danger') ? 'active' : ''}`}>
                    {t('admin.panel.tabs.dangerZone')}
                  </Link>
                  <button className="sidebar-logout" onClick={handleLogout}>
                    {t('common.logout')}
                  </button>
                </div>
              )}
            </div>
          )}

          {!isAdmin && (
            <div className="nav-section">
              <Link to="/admin" className={isActive('/admin') ? 'active' : ''}>
                {t('nav.admin')}
              </Link>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <LanguageSwitcher />
        </div>
      </aside>
    </>
  );
}
