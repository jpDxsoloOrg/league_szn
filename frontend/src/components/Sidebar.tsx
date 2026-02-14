import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSiteConfig } from '../contexts/SiteConfigContext';
import LanguageSwitcher from './LanguageSwitcher';
import './Sidebar.css';

/** Maps a user (public) path to its sub-group key */
function getUserGroupForPath(pathname: string): string | null {
  const core = ['/', '/championships', '/events', '/tournaments', '/contenders', '/stats'];
  const wrestler = ['/profile', '/challenges', '/promos'];

  if (core.some(p => pathname === p) || pathname.startsWith('/events/') || pathname.startsWith('/stats/') || pathname.startsWith('/contenders/')) return 'core';
  if (wrestler.some(p => pathname === p || pathname.startsWith(p + '/'))) return 'wrestler';
  return null;
}

/** Maps an admin path to its sub-group key */
function getAdminGroupForPath(pathname: string): string | null {
  const matchOps = ['/admin/schedule', '/admin/results', '/admin/events', '/admin/match-config'];
  const leagueSetup = ['/admin/players', '/admin/divisions', '/admin/seasons', '/admin/championships', '/admin/tournaments'];
  const contentSocial = ['/admin/challenges', '/admin/promos', '/admin/contender-config'];
  const fantasy = ['/admin/fantasy-shows', '/admin/fantasy-config'];
  const system = ['/admin/users', '/admin/features', '/admin/guide', '/admin/danger'];

  if (matchOps.some(p => pathname === p)) return 'matchOps';
  if (leagueSetup.some(p => pathname === p)) return 'leagueSetup';
  if (contentSocial.some(p => pathname === p)) return 'contentSocial';
  if (fantasy.some(p => pathname === p)) return 'fantasy';
  if (system.some(p => pathname === p)) return 'system';
  return null;
}

export default function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isAuthenticated, isAdminOrModerator, isSuperAdmin, isWrestler, isFantasy, signOut } = useAuth();
  const { features } = useSiteConfig();
  const [adminExpanded, setAdminExpanded] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ core: true });
  const [mobileOpen, setMobileOpen] = useState(false);

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

  // Determine visibility of public nav groups
  const showWrestlerGroup = isWrestler || features.challenges || features.promos;

  // Admin sub-groups: Content & Social and Fantasy always have visible items
  // (Challenges/Promos shown as disabled, contender-config always present; fantasy-shows/config always present)
  const showContentSocialGroup = true;
  const showFantasyGroup = true;

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
          {/* Core group - League */}
          <div className="nav-subgroup user-nav-subgroup">
            <button
              type="button"
              className="nav-subgroup-toggle user-nav-toggle"
              onClick={() => toggleGroup('core')}
              aria-expanded={!!expandedGroups['core']}
            >
              <span>{t('nav.groups.core')}</span>
              <span className="toggle-arrow">{expandedGroups['core'] ? '\u25BE' : '\u25B8'}</span>
            </button>
            {expandedGroups['core'] && (
              <div className="nav-subgroup-items user-nav-items">
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
                {features.contenders && (
                  <Link to="/contenders" className={isActive('/contenders') || isActive('/contenders/my-status') ? 'active' : ''}>
                    {t('nav.contenders')}
                  </Link>
                )}
                {features.statistics && (
                  <Link to="/stats" className={location.pathname.startsWith('/stats') ? 'active' : ''}>
                    {t('nav.statistics')}
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Wrestler group - profile/challenges/promos */}
          {showWrestlerGroup && (
            <div className="nav-subgroup user-nav-subgroup">
              <button
                type="button"
                className="nav-subgroup-toggle user-nav-toggle"
                onClick={() => toggleGroup('wrestler')}
                aria-expanded={!!expandedGroups['wrestler']}
              >
                <span>{t('nav.groups.wrestler')}</span>
                <span className="toggle-arrow">{expandedGroups['wrestler'] ? '\u25BE' : '\u25B8'}</span>
              </button>
              {expandedGroups['wrestler'] && (
                <div className="nav-subgroup-items user-nav-items">
                  {isWrestler ? (
                    <Link to="/profile" className={isActive('/profile') ? 'active' : ''}>
                      {t('nav.profile')}
                    </Link>
                  ) : (
                    <span className="nav-disabled">
                      {t('nav.profile')} <span className="role-locked">Wrestler Only</span>
                    </span>
                  )}
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
                </div>
              )}
            </div>
          )}

          {/* Fantasy - standalone */}
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

          {/* Help - standalone at bottom */}
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
                {/* Match Operations */}
                <div className="nav-subgroup">
                  <button
                    type="button"
                    className="nav-subgroup-toggle"
                    onClick={() => toggleGroup('matchOps')}
                    aria-expanded={!!expandedGroups['matchOps']}
                  >
                    <span>{t('admin.panel.groups.matchOps')}</span>
                    <span className="toggle-arrow">{expandedGroups['matchOps'] ? '\u25BE' : '\u25B8'}</span>
                  </button>
                  {expandedGroups['matchOps'] && (
                    <div className="nav-subgroup-items">
                      <Link to="/admin/schedule" className={isActive('/admin/schedule') ? 'active' : ''}>
                        {t('admin.panel.tabs.scheduleMatch')}
                      </Link>
                      <Link to="/admin/results" className={isActive('/admin/results') ? 'active' : ''}>
                        {t('admin.panel.tabs.recordResults')}
                      </Link>
                      <Link to="/admin/events" className={isActive('/admin/events') ? 'active' : ''}>
                        {t('admin.panel.tabs.events')}
                      </Link>
                      <Link to="/admin/match-config" className={isActive('/admin/match-config') ? 'active' : ''}>
                        {t('admin.panel.tabs.matchConfig')}
                      </Link>
                    </div>
                  )}
                </div>

                {/* League Setup */}
                <div className="nav-subgroup">
                  <button
                    type="button"
                    className="nav-subgroup-toggle"
                    onClick={() => toggleGroup('leagueSetup')}
                    aria-expanded={!!expandedGroups['leagueSetup']}
                  >
                    <span>{t('admin.panel.groups.leagueSetup')}</span>
                    <span className="toggle-arrow">{expandedGroups['leagueSetup'] ? '\u25BE' : '\u25B8'}</span>
                  </button>
                  {expandedGroups['leagueSetup'] && (
                    <div className="nav-subgroup-items">
                      <Link to="/admin/players" className={isActive('/admin/players') ? 'active' : ''}>
                        {t('admin.panel.tabs.managePlayers')}
                      </Link>
                      <Link to="/admin/divisions" className={isActive('/admin/divisions') ? 'active' : ''}>
                        {t('admin.panel.tabs.divisions')}
                      </Link>
                      <Link to="/admin/seasons" className={isActive('/admin/seasons') ? 'active' : ''}>
                        {t('admin.panel.tabs.seasons')}
                      </Link>
                      <Link to="/admin/championships" className={isActive('/admin/championships') ? 'active' : ''}>
                        {t('admin.panel.tabs.championships')}
                      </Link>
                      <Link to="/admin/tournaments" className={isActive('/admin/tournaments') ? 'active' : ''}>
                        {t('admin.panel.tabs.tournaments')}
                      </Link>
                    </div>
                  )}
                </div>

                {/* Content & Social */}
                {showContentSocialGroup && (
                  <div className="nav-subgroup">
                    <button
                      type="button"
                      className="nav-subgroup-toggle"
                      onClick={() => toggleGroup('contentSocial')}
                      aria-expanded={!!expandedGroups['contentSocial']}
                    >
                      <span>{t('admin.panel.groups.contentSocial')}</span>
                      <span className="toggle-arrow">{expandedGroups['contentSocial'] ? '\u25BE' : '\u25B8'}</span>
                    </button>
                    {expandedGroups['contentSocial'] && (
                      <div className="nav-subgroup-items">
                        <Link to="/admin/challenges" className={isActive('/admin/challenges') ? 'active' : ''}>
                          {t('admin.panel.tabs.challenges')}
                        </Link>
                        <Link to="/admin/promos" className={isActive('/admin/promos') ? 'active' : ''}>
                          {t('admin.panel.tabs.promos')}
                        </Link>
                        <Link to="/admin/contender-config" className={isActive('/admin/contender-config') ? 'active' : ''}>
                          {t('admin.panel.tabs.contenderConfig')}
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                {/* Fantasy */}
                {showFantasyGroup && (
                  <div className="nav-subgroup">
                    <button
                      type="button"
                      className="nav-subgroup-toggle"
                      onClick={() => toggleGroup('fantasy')}
                      aria-expanded={!!expandedGroups['fantasy']}
                    >
                      <span>{t('admin.panel.groups.fantasy')}</span>
                      <span className="toggle-arrow">{expandedGroups['fantasy'] ? '\u25BE' : '\u25B8'}</span>
                    </button>
                    {expandedGroups['fantasy'] && (
                      <div className="nav-subgroup-items">
                        <Link to="/admin/fantasy-shows" className={isActive('/admin/fantasy-shows') ? 'active' : ''}>
                          {t('admin.panel.tabs.fantasyShows')}
                        </Link>
                        <Link to="/admin/fantasy-config" className={isActive('/admin/fantasy-config') ? 'active' : ''}>
                          {t('admin.panel.tabs.fantasyConfig')}
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                {/* System */}
                <div className="nav-subgroup">
                  <button
                    type="button"
                    className="nav-subgroup-toggle"
                    onClick={() => toggleGroup('system')}
                    aria-expanded={!!expandedGroups['system']}
                  >
                    <span>{t('admin.panel.groups.system')}</span>
                    <span className="toggle-arrow">{expandedGroups['system'] ? '\u25BE' : '\u25B8'}</span>
                  </button>
                  {expandedGroups['system'] && (
                    <div className="nav-subgroup-items">
                      <Link to="/admin/users" className={isActive('/admin/users') ? 'active' : ''}>
                        User Management
                      </Link>
                      <Link to="/admin/features" className={isActive('/admin/features') ? 'active' : ''}>
                        Feature Management
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
