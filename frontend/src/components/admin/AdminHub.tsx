import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './AdminHub.css';

/**
 * Mobile-only admin hub: a grouped, tappable list of every admin tab,
 * rendered by AdminPanel at ≤768px when no tab is selected (/admin).
 * Groups map onto the existing /admin/:tab registry — no new routes.
 */

interface HubItem {
  /** Full navigation path (existing route only). */
  path: string;
  /** Existing i18n label key (reused from the tab registry / nav config). */
  labelKey: string;
  /** Key into HUB_ICON_SHAPES. */
  iconKey: string;
}

interface HubGroup {
  key: string;
  /** i18n key under admin.hub.groups. */
  titleKey: string;
  items: HubItem[];
}

/** Feather-style icon shapes keyed by hub icon key (same approach as MoreSheet's RowIcon). */
const HUB_ICON_SHAPES: Record<string, JSX.Element> = {
  players: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  wrestlers: (
    <>
      <circle cx="12" cy="4" r="2" />
      <path d="M4 8l8 3 8-3" />
      <path d="M12 11v4" />
      <path d="M8 21l4-6 4 6" />
    </>
  ),
  divisions: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </>
  ),
  overalls: (
    <>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </>
  ),
  schedule: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="10" y1="16" x2="14" y2="16" />
    </>
  ),
  events: (
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>
  ),
  'standalone-matches': (
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </>
  ),
  'match-config': (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  championships: (
    <>
      <circle cx="12" cy="8" r="6" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </>
  ),
  tournaments: (
    <>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ),
  'contender-config': (
    <>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </>
  ),
  'contender-overrides': (
    <>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </>
  ),
  announcements: (
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>
  ),
  videos: (
    <>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </>
  ),
  'storyline-requests': (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </>
  ),
  promos: (
    <>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </>
  ),
  rivalries: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  'heat-config': <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  companies: (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </>
  ),
  locations: (
    <>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  shows: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </>
  ),
  seasons: (
    <>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>
  ),
  'season-awards': (
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  ),
  factions: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  'tag-teams': (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </>
  ),
  features: (
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </>
  ),
  transfers: (
    <>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  danger: (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  chevron: <polyline points="9 18 15 12 9 6" />,
  back: <polyline points="15 18 9 12 15 6" />,
};

function HubIcon({ iconKey, className }: { iconKey: string; className?: string }) {
  const shape = HUB_ICON_SHAPES[iconKey] ?? <circle cx="12" cy="12" r="9" />;
  return (
    <svg
      className={className ?? 'admin-hub-row-icon'}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shape}
    </svg>
  );
}

/**
 * Group → tab mapping over the existing AdminPanel tab registry.
 * Every registry tab appears in exactly one group; standalone-matches is the
 * one non-registry entry (its own existing route at /admin/standalone-matches).
 */
const HUB_GROUPS: HubGroup[] = [
  {
    key: 'rosterPeople',
    titleKey: 'admin.hub.groups.rosterPeople',
    items: [
      { path: '/admin/players', labelKey: 'admin.panel.tabs.managePlayers', iconKey: 'players' },
      { path: '/admin/wrestlers', labelKey: 'admin.panel.tabs.wrestlers', iconKey: 'wrestlers' },
      { path: '/admin/divisions', labelKey: 'admin.panel.tabs.divisions', iconKey: 'divisions' },
      { path: '/admin/overalls', labelKey: 'overalls.admin.title', iconKey: 'overalls' },
    ],
  },
  {
    key: 'matchCompetition',
    titleKey: 'admin.hub.groups.matchCompetition',
    items: [
      { path: '/admin/schedule', labelKey: 'admin.panel.tabs.scheduleMatch', iconKey: 'schedule' },
      { path: '/admin/events', labelKey: 'admin.panel.tabs.events', iconKey: 'events' },
      { path: '/admin/standalone-matches', labelKey: 'admin.panel.tabs.standaloneMatches', iconKey: 'standalone-matches' },
      { path: '/admin/match-config', labelKey: 'admin.panel.tabs.matchConfig', iconKey: 'match-config' },
      { path: '/admin/championships', labelKey: 'admin.panel.tabs.championships', iconKey: 'championships' },
      { path: '/admin/tournaments', labelKey: 'admin.panel.tabs.tournaments', iconKey: 'tournaments' },
      { path: '/admin/contender-config', labelKey: 'admin.panel.tabs.contenderConfig', iconKey: 'contender-config' },
      { path: '/admin/contender-overrides', labelKey: 'admin.panel.tabs.contenderOverrides', iconKey: 'contender-overrides' },
    ],
  },
  {
    key: 'contentStorylines',
    titleKey: 'admin.hub.groups.contentStorylines',
    items: [
      { path: '/admin/announcements', labelKey: 'admin.panel.tabs.announcements', iconKey: 'announcements' },
      { path: '/admin/videos', labelKey: 'admin.panel.tabs.videos', iconKey: 'videos' },
      { path: '/admin/storyline-requests', labelKey: 'admin.panel.tabs.storylineRequests', iconKey: 'storyline-requests' },
      { path: '/admin/promos', labelKey: 'admin.panel.tabs.promos', iconKey: 'promos' },
      { path: '/admin/rivalries', labelKey: 'admin.panel.tabs.rivalries', iconKey: 'rivalries' },
      { path: '/admin/heat-config', labelKey: 'admin.panel.tabs.heatConfig', iconKey: 'heat-config' },
    ],
  },
  {
    key: 'leagueConfig',
    titleKey: 'admin.hub.groups.leagueConfig',
    items: [
      { path: '/admin/companies', labelKey: 'admin.panel.tabs.companies', iconKey: 'companies' },
      { path: '/admin/locations', labelKey: 'admin.panel.tabs.locations', iconKey: 'locations' },
      { path: '/admin/shows', labelKey: 'admin.panel.tabs.shows', iconKey: 'shows' },
      { path: '/admin/seasons', labelKey: 'admin.panel.tabs.seasons', iconKey: 'seasons' },
      { path: '/admin/season-awards', labelKey: 'admin.panel.tabs.seasonAwards', iconKey: 'season-awards' },
      { path: '/admin/factions', labelKey: 'admin.panel.tabs.factions', iconKey: 'factions' },
      { path: '/admin/tag-teams', labelKey: 'admin.panel.tabs.tagTeams', iconKey: 'tag-teams' },
      { path: '/admin/features', labelKey: 'admin.panel.tabs.features', iconKey: 'features' },
    ],
  },
  {
    key: 'usersAccess',
    titleKey: 'admin.hub.groups.usersAccess',
    items: [
      { path: '/admin/users', labelKey: 'admin.panel.tabs.users', iconKey: 'users' },
      { path: '/admin/transfers', labelKey: 'admin.panel.tabs.transfers', iconKey: 'transfers' },
    ],
  },
];

interface AdminHubProps {
  /** Danger zone group is rendered only for super-admins (mirrors AdminPanel gating). */
  isSuperAdmin: boolean;
}

export default function AdminHub({ isSuperAdmin }: AdminHubProps) {
  const { t } = useTranslation();

  return (
    <nav className="admin-hub" aria-label={t('admin.panel.title')}>
      {HUB_GROUPS.map((group) => (
        <section key={group.key} className="admin-hub-group">
          <h3 className="admin-hub-group-title">{t(group.titleKey)}</h3>
          <div className="admin-hub-card">
            {group.items.map((item) => (
              <Link key={item.path} to={item.path} className="admin-hub-row">
                <span className="admin-hub-row-leading">
                  <span className="admin-hub-icon-chip">
                    <HubIcon iconKey={item.iconKey} />
                  </span>
                  <span className="admin-hub-row-label">{t(item.labelKey)}</span>
                </span>
                <HubIcon iconKey="chevron" className="admin-hub-row-chevron" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      {isSuperAdmin && (
        <section className="admin-hub-group">
          <h3 className="admin-hub-group-title admin-hub-group-title-danger">
            {t('admin.hub.groups.dangerZone')}
          </h3>
          <div className="admin-hub-card admin-hub-card-danger">
            <Link to="/admin/danger" className="admin-hub-row admin-hub-row-danger">
              <span className="admin-hub-row-leading">
                <span className="admin-hub-icon-chip admin-hub-icon-chip-danger">
                  <HubIcon iconKey="danger" />
                </span>
                <span className="admin-hub-row-text">
                  <span className="admin-hub-row-label admin-hub-row-label-danger">
                    {t('admin.panel.tabs.dangerZone')}
                  </span>
                  <span className="admin-hub-row-caption">{t('admin.hub.superAdminOnly')}</span>
                </span>
              </span>
              <HubIcon iconKey="chevron" className="admin-hub-row-chevron admin-hub-row-chevron-danger" />
            </Link>
          </div>
        </section>
      )}
    </nav>
  );
}

/** Small back row shown above a tab's content on mobile, navigating to the hub. */
export function AdminHubBackRow() {
  const { t } = useTranslation();
  return (
    <Link to="/admin" className="admin-hub-back-row">
      <HubIcon iconKey="back" className="admin-hub-back-chevron" />
      <span className="admin-hub-back-label">{t('admin.hub.back')}</span>
    </Link>
  );
}
