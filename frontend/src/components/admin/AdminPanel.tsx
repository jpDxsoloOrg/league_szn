import { Suspense, lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  canAccessAdminEntry,
  findAdminEntry,
  getAdminPath,
  getPageInfo,
  isAdminTab,
  type AdminTab,
} from '../../config/navConfig';
import Skeleton from '../ui/Skeleton';
import AdminHub, { AdminHubBackRow } from './AdminHub';
import AdminNav from './AdminNav';
import './AdminPanel.css';
// Shared mobile (≤768px) `am-` template classes for all admin sections
// rendered by this panel — imported once here so they cascade everywhere.
import './mobile/adminMobile.css';

const DEFAULT_TAB: AdminTab = 'players';

const TAB_COMPONENTS: Record<AdminTab, LazyExoticComponent<ComponentType>> = {
  schedule: lazy(() => import('./ScheduleMatch')),
  events: lazy(() => import('./MatchCardBuilder')),
  'standalone-matches': lazy(() => import('./StandaloneMatches')),
  users: lazy(() => import('./ManageUsers')),
  players: lazy(() => import('./ManagePlayers')),
  wrestlers: lazy(() => import('./ManageWrestlers')),
  overalls: lazy(() => import('./ManageOveralls')),
  divisions: lazy(() => import('./ManageDivisions')),
  transfers: lazy(() => import('./ManageTransfers')),
  'tag-teams': lazy(() => import('./ManageTagTeams')),
  factions: lazy(() => import('./ManageFactions')),
  seasons: lazy(() => import('./ManageSeasons')),
  'season-awards': lazy(() => import('./ManageSeasonAwards')),
  championships: lazy(() => import('./ManageChampionships')),
  tournaments: lazy(() => import('./CreateTournament')),
  'contender-config': lazy(() => import('./AdminContenderConfig')),
  'contender-overrides': lazy(() => import('./AdminContenderOverrides')),
  'match-config': lazy(() => import('./ManageMatchConfig')),
  promos: lazy(() => import('./AdminPromos')),
  rivalries: lazy(() => import('./AdminRivalries')),
  'heat-config': lazy(() => import('./AdminHeatConfig')),
  'storyline-requests': lazy(() => import('./ManageStorylineRequests')),
  announcements: lazy(() => import('./ManageAnnouncements')),
  videos: lazy(() => import('./ManageVideos')),
  companies: lazy(() => import('./ManageCompanies')),
  shows: lazy(() => import('./ManageShows')),
  locations: lazy(() => import('./ManageLocations')),
  features: lazy(() => import('./ManageFeatures')),
  danger: lazy(() => import('./ClearAllData')),
};

export default function AdminPanel() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab: string }>();
  const location = useLocation();
  const { isAuthenticated, isAdminOrModerator, isSuperAdmin } = useAuth();
  const isMobile = useIsMobile();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!isAdminOrModerator) {
    return (
      <div className="admin-panel">
        <div className="access-denied">
          <h2>Admin Access Required</h2>
          <p>You need admin privileges to access this panel.</p>
        </div>
      </div>
    );
  }

  if (tab && !isAdminTab(tab)) {
    return <Navigate to="/admin" replace />;
  }

  const activeTab: AdminTab = tab && isAdminTab(tab) ? tab : DEFAULT_TAB;
  const activeEntry = findAdminEntry(activeTab);

  // The registry's minimum role matches the API, so a direct URL gets a clear
  // message rather than a page whose requests all fail.
  if (activeEntry && !canAccessAdminEntry(activeEntry, isSuperAdmin)) {
    return (
      <div className="admin-panel">
        <div className="access-denied">
          <h2>Full Admin Access Required</h2>
          <p>This action requires full Admin privileges.</p>
        </div>
      </div>
    );
  }

  // Mobile hub: at /admin with no tab selected, show the grouped hub list
  // instead of defaulting into the players tab.
  if (isMobile && !tab) {
    return (
      <div className="admin-panel">
        <AdminHub isSuperAdmin={isSuperAdmin} />
      </div>
    );
  }

  const ActiveTabContent = TAB_COMPONENTS[activeTab];
  const content = (
    <div className="admin-content">
      <Suspense fallback={<Skeleton variant="block" />}>
        <ActiveTabContent />
      </Suspense>
    </div>
  );

  if (isMobile) {
    return (
      <div className="admin-panel">
        <AdminHubBackRow />
        {content}
      </div>
    );
  }

  const { parent } = getPageInfo(getAdminPath(activeTab), t);

  return (
    <div className="admin-panel admin-layout">
      <AdminNav activeTab={activeTab} isSuperAdmin={isSuperAdmin} />
      <div className="admin-layout__main">
        {parent && <p className="admin-breadcrumb">{parent}</p>}
        <div className="admin-onboarding-banner">
          <p>
            New to admin workflows? Start with{' '}
            <Link to="/guide/wiki/admin-quickstart">Admin Quickstart</Link> and then review{' '}
            <Link to="/guide/wiki/admin-workflow">Typical Weekly Workflow</Link>.
          </p>
        </div>
        {content}
      </div>
    </div>
  );
}
