import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSiteConfig } from '../contexts/SiteConfigContext';
import LanguageSwitcher from './LanguageSwitcher';
import './Sidebar.css';

export default function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isAuthenticated, isAdminOrModerator, isSuperAdmin, isWrestler, isFantasy, signOut } = useAuth();
  const { features } = useSiteConfig();
  const [adminExpanded, setAdminExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-expand admin section when navigating to admin routes
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setAdminExpanded(true);
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

  return (
    <>
    {/* Hamburger button — visible only on mobile */}
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

    {/* Overlay backdrop — visible only when mobile sidebar is open */}
    {mobileOpen && (
      <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
    )}

    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <h2>{t('header.title')}</h2>
        <LanguageSwitcher />
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          {/* Public routes - everyone can see these */}
          <Link to="/" className={isActive('/') ? 'active' : ''}>
            {t('nav.standings')}
          </Link>
          <Link to="/championships" className={isActive('/championships') ? 'active' : ''}>
            {t('nav.championships')}
          </Link>
          <Link to="/events" className={isActive('/events') || location.pathname.startsWith('/events/') ? 'active' : ''}>
            {t('nav.events')}
          </Link>
          <Link to="/tournaments" className={isActive('/tournaments') ? 'active' : ''}>
            {t('nav.tournaments')}
          </Link>

          {/* Contenders - hidden when feature is disabled */}
          {features.contenders && (
            <Link to="/contenders" className={isActive('/contenders') || isActive('/contenders/my-status') ? 'active' : ''}>
              {t('nav.contenders')}
            </Link>
          )}

          {/* Wrestler-only features (also visible to Admin) */}
          {isWrestler ? (
            <>
              <Link to="/profile" className={isActive('/profile') ? 'active' : ''}>
                {t('nav.profile')}
              </Link>
              {features.challenges ? (
                <Link to="/challenges" className={location.pathname.startsWith('/challenges') ? 'active' : ''}>
                  {t('nav.challenges')}
                </Link>
              ) : null}
              {features.promos ? (
                <Link to="/promos" className={location.pathname.startsWith('/promos') ? 'active' : ''}>
                  {t('nav.promos')}
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <span className="nav-disabled">
                {t('nav.profile')} <span className="role-locked">Wrestler Only</span>
              </span>
              {features.challenges && (
                <Link to="/challenges" className={location.pathname.startsWith('/challenges') ? 'active' : ''}>
                  {t('nav.challenges')}
                </Link>
              )}
              {features.promos && (
                <Link to="/promos" className={location.pathname.startsWith('/promos') ? 'active' : ''}>
                  {t('nav.promos')}
                </Link>
              )}
            </>
          )}

          {/* Statistics - hidden when feature is disabled */}
          {features.statistics && (
            <Link to="/stats" className={location.pathname.startsWith('/stats') ? 'active' : ''}>
              {t('nav.statistics')}
            </Link>
          )}

          {/* Fantasy - hidden when feature is disabled */}
          {features.fantasy && (
            <>
              {isFantasy ? (
                <Link to="/fantasy" className={location.pathname.startsWith('/fantasy') ? 'active' : ''}>
                  {t('nav.fantasy')}
                </Link>
              ) : (
                <span className="nav-disabled">
                  {t('nav.fantasy')} <span className="coming-soon">Coming Soon</span>
                </span>
              )}
            </>
          )}

          <Link to="/guide" className={isActive('/guide') ? 'active' : ''}>
            {t('nav.help')}
          </Link>
        </div>

        {/* Admin section - for Admin and Moderator roles */}
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
                <Link to="/admin/users" className={isActive('/admin/users') ? 'active' : ''}>
                  User Management
                </Link>
                <Link to="/admin/features" className={isActive('/admin/features') ? 'active' : ''}>
                  Feature Management
                </Link>
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
                <Link to="/admin/match-types" className={isActive('/admin/match-types') ? 'active' : ''}>
                  {t('admin.panel.tabs.matchTypes')}
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
                <Link to="/admin/fantasy-shows" className={isActive('/admin/fantasy-shows') ? 'active' : ''}>
                  {t('admin.panel.tabs.fantasyShows')}
                </Link>
                <Link to="/admin/fantasy-config" className={isActive('/admin/fantasy-config') ? 'active' : ''}>
                  {t('admin.panel.tabs.fantasyConfig')}
                </Link>
                <Link to="/admin/guide" className={isActive('/admin/guide') ? 'active' : ''}>
                  {t('admin.panel.tabs.help')}
                </Link>
                {/* Danger zone only visible to super admins */}
                {isSuperAdmin && (
                  <Link to="/admin/danger" className={`danger-link ${isActive('/admin/danger') ? 'active' : ''}`}>
                    {t('admin.panel.tabs.dangerZone')}
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Auth section */}
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
