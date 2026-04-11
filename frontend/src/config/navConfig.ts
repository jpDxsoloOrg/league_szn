/**
 * Single source of truth for app navigation: groups and links.
 * Used by both Sidebar (vertical) and TopNav (horizontal).
 * Visibility (feature flags, roles) is applied at render time by consumers.
 */

export type NavItem = {
  path: string;
  i18nKey: string;
  /** When set, link is only shown when this feature is enabled */
  feature?: 'challenges' | 'promos' | 'contenders' | 'statistics' | 'fantasy' | 'stables';
  /** When set, link is only shown when user has this role (and feature if any) */
  role?: 'Wrestler' | 'Fantasy';
  /** Disabled label key when role not met (e.g. "Wrestler Only") */
  roleLockedLabel?: string;
  /** Coming soon label when feature/role not met */
  comingSoonLabel?: string;
  danger?: boolean;
};

export type NavGroup = {
  key: string;
  i18nKey: string;
  items: NavItem[];
};

/** Public (user) nav: League, Competition, Rankings, Factions, Wrestler Zone */
export const USER_NAV_GROUPS: NavGroup[] = [
  {
    key: 'league',
    i18nKey: 'nav.groups.league',
    items: [
      { path: '/', i18nKey: 'nav.dashboard' },
      { path: '/standings', i18nKey: 'nav.standings' },
      { path: '/activity', i18nKey: 'nav.activity' },
    ],
  },
  {
    key: 'competition',
    i18nKey: 'nav.groups.competition',
    items: [
      { path: '/championships', i18nKey: 'nav.championships' },
      { path: '/events', i18nKey: 'nav.events' },
      { path: '/matches', i18nKey: 'nav.matchSearch' },
      { path: '/tournaments', i18nKey: 'nav.tournaments' },
      { path: '/awards', i18nKey: 'nav.seasonAwards' },
    ],
  },
  {
    key: 'rankings',
    i18nKey: 'nav.groups.rankings',
    items: [
      { path: '/contenders', i18nKey: 'nav.contenders', feature: 'contenders' },
      { path: '/stats', i18nKey: 'nav.statistics', feature: 'statistics' },
      { path: '/highlights', i18nKey: 'nav.highlights' },
    ],
  },
  {
    key: 'factions',
    i18nKey: 'nav.groups.factions',
    items: [
      { path: '/stables', i18nKey: 'nav.stables', feature: 'stables' },
      { path: '/tag-teams', i18nKey: 'nav.tagTeams', feature: 'stables' },
    ],
  },
  {
    key: 'wrestler',
    i18nKey: 'nav.groups.wrestler',
    items: [
      { path: '/profile', i18nKey: 'nav.profile', role: 'Wrestler', roleLockedLabel: 'Wrestler Only' },
      { path: '/find-match', i18nKey: 'nav.findMatch', role: 'Wrestler', roleLockedLabel: 'Wrestler Only' },
      { path: '/challenges', i18nKey: 'nav.challenges', feature: 'challenges' },
      { path: '/promos', i18nKey: 'nav.promos', feature: 'promos' },
      { path: '/my-stable', i18nKey: 'nav.myStable', feature: 'stables', role: 'Wrestler', roleLockedLabel: 'Wrestler Only' },
      { path: '/my-tag-team', i18nKey: 'nav.myTagTeam', feature: 'stables', role: 'Wrestler', roleLockedLabel: 'Wrestler Only' },
    ],
  },
];

/** Standalone user links (no subgroup): Fantasy, Help */
export const USER_NAV_STANDALONE: (NavItem & { type: 'fantasy' | 'link' })[] = [
  {
    type: 'fantasy',
    path: '/fantasy',
    i18nKey: 'nav.fantasy',
    feature: 'fantasy',
    comingSoonLabel: 'Coming Soon',
  },
  {
    type: 'link',
    path: '/guide',
    i18nKey: 'nav.help',
  },
];

/** Admin nav: sub-groups with items */
export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    key: 'matchDay',
    i18nKey: 'admin.panel.groups.matchDay',
    items: [
      { path: '/admin/schedule', i18nKey: 'admin.panel.tabs.scheduleMatch' },
      { path: '/admin/events', i18nKey: 'admin.panel.tabs.events' },
      { path: '/admin/standalone-matches', i18nKey: 'admin.panel.tabs.standaloneMatches' },
      { path: '/admin/match-config', i18nKey: 'admin.panel.tabs.matchConfig' },
    ],
  },
  {
    key: 'rosterSeasons',
    i18nKey: 'admin.panel.groups.rosterSeasons',
    items: [
      { path: '/admin/players', i18nKey: 'admin.panel.tabs.managePlayers' },
      { path: '/admin/divisions', i18nKey: 'admin.panel.tabs.divisions' },
      { path: '/admin/transfers', i18nKey: 'admin.panel.tabs.transfers' },
      { path: '/admin/seasons', i18nKey: 'admin.panel.tabs.seasons' },
      { path: '/admin/season-awards', i18nKey: 'admin.panel.tabs.seasonAwards' },
    ],
  },
  {
    key: 'titlesTournaments',
    i18nKey: 'admin.panel.groups.titlesTournaments',
    items: [
      { path: '/admin/championships', i18nKey: 'admin.panel.tabs.championships' },
      { path: '/admin/tournaments', i18nKey: 'admin.panel.tabs.tournaments' },
      { path: '/admin/companies', i18nKey: 'admin.panel.tabs.companies' },
      { path: '/admin/shows', i18nKey: 'admin.panel.tabs.shows' },
    ],
  },
  {
    key: 'adminRankings',
    i18nKey: 'admin.panel.groups.rankings',
    items: [
      { path: '/admin/contender-config', i18nKey: 'admin.panel.tabs.contenderConfig' },
      { path: '/admin/contender-overrides', i18nKey: 'admin.panel.tabs.contenderOverrides' },
    ],
  },
  {
    key: 'content',
    i18nKey: 'admin.panel.groups.content',
    items: [
      { path: '/admin/announcements', i18nKey: 'admin.panel.tabs.announcements' },
      { path: '/admin/videos', i18nKey: 'admin.panel.tabs.videos' },
      { path: '/admin/storyline-requests', i18nKey: 'admin.panel.tabs.storylineRequests' },
      { path: '/admin/challenges', i18nKey: 'admin.panel.tabs.challenges' },
      { path: '/admin/promos', i18nKey: 'admin.panel.tabs.promos' },
    ],
  },
  {
    key: 'adminFactions',
    i18nKey: 'admin.panel.groups.factions',
    items: [
      { path: '/admin/stables', i18nKey: 'admin.panel.tabs.stables' },
      { path: '/admin/tag-teams', i18nKey: 'admin.panel.tabs.tagTeams' },
    ],
  },
  {
    key: 'fantasy',
    i18nKey: 'admin.panel.groups.fantasy',
    items: [
      { path: '/admin/fantasy-shows', i18nKey: 'admin.panel.tabs.fantasyShows' },
      { path: '/admin/fantasy-config', i18nKey: 'admin.panel.tabs.fantasyConfig' },
    ],
  },
  {
    key: 'system',
    i18nKey: 'admin.panel.groups.system',
    items: [
      { path: '/admin/users', i18nKey: 'admin.panel.tabs.users' },
      { path: '/admin/features', i18nKey: 'admin.panel.tabs.features' },
      { path: '/admin/danger', i18nKey: 'admin.panel.tabs.dangerZone', danger: true },
    ],
  },
];

/** Path → group key for user nav (for auto-expand) */
export function getUserGroupForPath(pathname: string): string | null {
  const league = ['/', '/standings', '/activity'];
  const competition = ['/championships', '/events', '/matches', '/tournaments', '/awards'];
  const rankings = ['/contenders', '/stats', '/highlights'];
  const factions = ['/stables', '/tag-teams'];
  const wrestler = ['/profile', '/find-match', '/challenges', '/promos', '/my-stable', '/my-tag-team'];

  if (league.some((p) => pathname === p)) return 'league';
  if (competition.some((p) => pathname === p || pathname.startsWith(p + '/'))) return 'competition';
  if (rankings.some((p) => pathname === p || pathname.startsWith(p + '/'))) return 'rankings';
  if (factions.some((p) => pathname === p || pathname.startsWith(p + '/'))) return 'factions';
  if (wrestler.some((p) => pathname === p || pathname.startsWith(p + '/'))) return 'wrestler';
  return null;
}

/** Path → admin group key */
export function getAdminGroupForPath(pathname: string): string | null {
  const matchDay = ['/admin/schedule', '/admin/events', '/admin/standalone-matches', '/admin/match-config'];
  const rosterSeasons = ['/admin/players', '/admin/divisions', '/admin/transfers', '/admin/seasons', '/admin/season-awards'];
  const titlesTournaments = ['/admin/championships', '/admin/tournaments', '/admin/companies', '/admin/shows'];
  const adminRankings = ['/admin/contender-config', '/admin/contender-overrides'];
  const content = ['/admin/announcements', '/admin/videos', '/admin/storyline-requests', '/admin/challenges', '/admin/promos'];
  const adminFactions = ['/admin/stables', '/admin/tag-teams'];
  const fantasy = ['/admin/fantasy-shows', '/admin/fantasy-config'];
  const system = ['/admin/users', '/admin/features', '/admin/danger'];
  if (matchDay.some((p) => pathname === p)) return 'matchDay';
  if (rosterSeasons.some((p) => pathname === p)) return 'rosterSeasons';
  if (titlesTournaments.some((p) => pathname === p)) return 'titlesTournaments';
  if (adminRankings.some((p) => pathname === p)) return 'adminRankings';
  if (content.some((p) => pathname === p)) return 'content';
  if (adminFactions.some((p) => pathname === p)) return 'adminFactions';
  if (fantasy.some((p) => pathname === p)) return 'fantasy';
  if (system.some((p) => pathname === p)) return 'system';
  return null;
}
