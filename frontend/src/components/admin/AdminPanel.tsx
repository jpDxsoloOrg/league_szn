import { Suspense, lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Flag, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  canAccessAdminEntry,
  findAdminEntry,
  getAdminPath,
  getPageInfo,
  isAdminEntryEnabled,
  isAdminTab,
  type AdminTab,
} from '../../config/navConfig';
import EmptyState from '../ui/EmptyState';
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
  'contender-overrides': lazy(() => import('./AdminContenderOverrides')),
  progression: lazy(() => import('./ManageProgression')),
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
  const { features, isLoading: featuresLoading } = useSiteConfig();
  const isMobile = useIsMobile();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!isAdminOrModerator) {
    return (
      <div className="admin-panel">
        <EmptyState
          icon={<ShieldAlert aria-hidden="true" size={32} />}
          title={t('adminContent.panel.accessRequired', 'Admin Access Required')}
          description={t('adminContent.panel.accessRequiredText', 'You need admin privileges to access this panel.')}
        />
      </div>
    );
  }

  // Call-outs moderation lives under Promos.
  if (tab === 'challenges') {
    return <Navigate to="/admin/promos?view=call-outs" replace />;
  }

  // The Match Card Builder lived here. Cards are now built on the event's own page.
  if (tab === 'events') {
    return <Navigate to="/events" replace />;
  }

  // Rankings now update on their own, which leaves overrides as the only control.
  if (tab === 'contender-config') {
    return <Navigate to="/admin/contender-overrides" replace />;
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
        <EmptyState
          icon={<ShieldAlert aria-hidden="true" size={32} />}
          title={t('adminContent.panel.fullAccessRequired', 'Full Admin Access Required')}
          description={t('adminContent.panel.fullAccessRequiredText', 'This action requires full Admin privileges.')}
        />
      </div>
    );
  }

  // A direct URL to a page whose feature is off gets a message, not a broken page.
  if (activeEntry && !isAdminEntryEnabled(activeEntry, features)) {
    return (
      <div className="admin-panel">
        {featuresLoading ? <Skeleton variant="block" /> : (
          <EmptyState
            icon={<Flag aria-hidden="true" size={32} />}
            title={t('adminContent.panel.featureOff', 'This feature is turned off')}
            description={t('adminContent.panel.featureOffText', 'An Admin can turn it back on in Feature Management.')}
          />
        )}
      </div>
    );
  }

  // Mobile hub: at /admin with no tab selected, show the grouped hub list
  // instead of defaulting into the players tab.
  if (isMobile && !tab) {
    return (
      <div className="admin-panel">
        <AdminHub isSuperAdmin={isSuperAdmin} features={features} />
      </div>
    );
  }

  // Wider screens open the default tab at its own URL, so narrowing the window
  // keeps the page rather than swapping it for the hub above.
  if (!tab) {
    return <Navigate to={getAdminPath(DEFAULT_TAB)} replace />;
  }

  const ActiveTabContent = TAB_COMPONENTS[activeTab];
  const { parent } = getPageInfo(getAdminPath(activeTab), t);

  // One tree for both widths. The page stays mounted when the window crosses the
  // breakpoint, so an open dialog and anything typed into it survive.
  return (
    <div className={isMobile ? 'admin-panel' : 'admin-panel admin-layout'}>
      {isMobile
        ? <AdminHubBackRow />
        : <AdminNav activeTab={activeTab} isSuperAdmin={isSuperAdmin} features={features} />}
      <div className="admin-layout__main">
        {!isMobile && parent && <p className="admin-breadcrumb">{parent}</p>}
        <div className="admin-content">
          <Suspense fallback={<Skeleton variant="block" />}>
            <ActiveTabContent />
          </Suspense>
        </div>
        {!isMobile && (
          <p className="admin-help">
            {t('adminContent.panel.helpPrefix', 'New to admin workflows?')}{' '}
            <Link to="/guide/wiki/admin-quickstart">{t('adminContent.panel.quickstart', 'Admin Quickstart')}</Link>
            {' · '}
            <Link to="/guide/wiki/admin-workflow">{t('adminContent.panel.weeklyWorkflow', 'Typical Weekly Workflow')}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
