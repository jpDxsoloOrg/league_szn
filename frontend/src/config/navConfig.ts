/**
 * Single source of truth for app navigation: groups and links.
 * Used by both Sidebar (vertical) and TopNav (horizontal).
 * Visibility (feature flags, roles) is applied at render time by consumers.
 */

export type NavItem = {
  path: string;
  i18nKey: string;
  /** When set, link is only shown when this feature is enabled */
  feature?: 'challenges' | 'promos' | 'contenders' | 'statistics' | 'fantasy';
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

/** Public (user) nav: Core, Wrestler, standalone Fantasy & Help */
export const USER_NAV_GROUPS: NavGroup[] = [
  {
    key: 'core',
    i18nKey: 'nav.groups.core',
    items: [
      { path: '/', i18nKey: 'nav.standings' },
      { path: '/championships', i18nKey: 'nav.championships' },
      { path: '/events', i18nKey: 'nav.events' },
      { path: '/tournaments', i18nKey: 'nav.tournaments' },
      { path: '/contenders', i18nKey: 'nav.contenders', feature: 'contenders' },
      { path: '/stats', i18nKey: 'nav.statistics', feature: 'statistics' },
      { path: '/rivalries', i18nKey: 'nav.rivalries', feature: 'statistics' },
    ],
  },
  {
    key: 'wrestler',
    i18nKey: 'nav.groups.wrestler',
    items: [
      { path: '/profile', i18nKey: 'nav.profile', role: 'Wrestler', roleLockedLabel: 'Wrestler Only' },
      { path: '/challenges', i18nKey: 'nav.challenges', feature: 'challenges' },
      { path: '/promos', i18nKey: 'nav.promos', feature: 'promos' },
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
    key: 'matchOps',
    i18nKey: 'admin.panel.groups.matchOps',
    items: [
      { path: '/admin/schedule', i18nKey: 'admin.panel.tabs.scheduleMatch' },
      { path: '/admin/results', i18nKey: 'admin.panel.tabs.recordResults' },
      { path: '/admin/events', i18nKey: 'admin.panel.tabs.events' },
      { path: '/admin/match-config', i18nKey: 'admin.panel.tabs.matchConfig' },
    ],
  },
  {
    key: 'leagueSetup',
    i18nKey: 'admin.panel.groups.leagueSetup',
    items: [
      { path: '/admin/players', i18nKey: 'admin.panel.tabs.managePlayers' },
      { path: '/admin/divisions', i18nKey: 'admin.panel.tabs.divisions' },
      { path: '/admin/seasons', i18nKey: 'admin.panel.tabs.seasons' },
      { path: '/admin/championships', i18nKey: 'admin.panel.tabs.championships' },
      { path: '/admin/tournaments', i18nKey: 'admin.panel.tabs.tournaments' },
    ],
  },
  {
    key: 'contentSocial',
    i18nKey: 'admin.panel.groups.contentSocial',
    items: [
      { path: '/admin/challenges', i18nKey: 'admin.panel.tabs.challenges' },
      { path: '/admin/promos', i18nKey: 'admin.panel.tabs.promos' },
      { path: '/admin/contender-config', i18nKey: 'admin.panel.tabs.contenderConfig' },
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
  const core = ['/', '/championships', '/events', '/tournaments', '/contenders', '/stats', '/rivalries'];
  const wrestler = ['/profile', '/challenges', '/promos'];
  if (core.some((p) => pathname === p) || pathname.startsWith('/events/') || pathname.startsWith('/stats/') || pathname.startsWith('/contenders/') || pathname.startsWith('/rivalries')) return 'core';
  if (wrestler.some((p) => pathname === p || pathname.startsWith(p + '/'))) return 'wrestler';
  return null;
}

/** Path → admin group key */
export function getAdminGroupForPath(pathname: string): string | null {
  const matchOps = ['/admin/schedule', '/admin/results', '/admin/events', '/admin/match-config'];
  const leagueSetup = ['/admin/players', '/admin/divisions', '/admin/seasons', '/admin/championships', '/admin/tournaments'];
  const contentSocial = ['/admin/challenges', '/admin/promos', '/admin/contender-config'];
  const fantasy = ['/admin/fantasy-shows', '/admin/fantasy-config'];
  const system = ['/admin/users', '/admin/features', '/admin/danger'];
  if (matchOps.some((p) => pathname === p)) return 'matchOps';
  if (leagueSetup.some((p) => pathname === p)) return 'leagueSetup';
  if (contentSocial.some((p) => pathname === p)) return 'contentSocial';
  if (fantasy.some((p) => pathname === p)) return 'fantasy';
  if (system.some((p) => pathname === p)) return 'system';
  return null;
}
