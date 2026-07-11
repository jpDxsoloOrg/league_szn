/**
 * Single source of truth for app navigation: groups and links.
 * Used by the Sidebar (vertical) navigation.
 * Visibility (feature flags, roles) is applied at render time by consumers.
 */

import type { SiteFeatures } from '../services/api';

export type NavItem = {
  path: string;
  i18nKey: string;
  /** When set, link is only shown when this feature is enabled */
  feature?: 'challenges' | 'promos' | 'contenders' | 'statistics' | 'stables' | 'rivalries';
  /** When set, link is only shown when user has this role (and feature if any) */
  role?: 'Wrestler';
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

/**
 * Shared visibility logic for user nav items (feature flags + role gating).
 * Used by Sidebar and the mobile MoreSheet so filtering stays consistent.
 */
export function isUserItemVisible(
  item: NavItem,
  features: SiteFeatures,
  isWrestler: boolean
): { show: boolean; disabled: boolean; disabledLabel?: string } {
  if (item.feature && !features[item.feature]) return { show: false, disabled: false };
  if (item.role === 'Wrestler') {
    return { show: true, disabled: !isWrestler, disabledLabel: item.roleLockedLabel };
  }
  return { show: true, disabled: false };
}

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
      { path: '/factions', i18nKey: 'nav.factions', feature: 'stables' },
      { path: '/tag-teams', i18nKey: 'nav.tagTeams', feature: 'stables' },
    ],
  },
  {
    key: 'wrestler',
    i18nKey: 'nav.groups.wrestler',
    items: [
      { path: '/profile', i18nKey: 'nav.profile', role: 'Wrestler', roleLockedLabel: 'Wrestler Only' },
      { path: '/my-videos', i18nKey: 'nav.myVideos', role: 'Wrestler', roleLockedLabel: 'Wrestler Only' },
      { path: '/promos', i18nKey: 'nav.promos', feature: 'promos' },
      { path: '/rivalries', i18nKey: 'nav.rivalries', feature: 'rivalries' },
      { path: '/my-faction', i18nKey: 'nav.myFaction', feature: 'stables', role: 'Wrestler', roleLockedLabel: 'Wrestler Only' },
      { path: '/my-tag-team', i18nKey: 'nav.myTagTeam', feature: 'stables', role: 'Wrestler', roleLockedLabel: 'Wrestler Only' },
    ],
  },
];

/** Standalone user links (no subgroup): Help */
export const USER_NAV_STANDALONE: (NavItem & { type: 'link' })[] = [
  {
    type: 'link',
    path: '/guide',
    i18nKey: 'nav.help',
  },
];

/** Basic (simplified) user nav: flat list of essential pages, rendered without groups. */
export const BASIC_NAV_PATHS: string[] = [
  '/',
  '/standings',
  '/events',
  '/profile',
  '/promos',
  '/contenders',
];

/** Returns the full NavItem objects for basic mode in display order. */
export function getBasicNavItems(): NavItem[] {
  const byPath = new Map<string, NavItem>();
  for (const group of USER_NAV_GROUPS) {
    for (const item of group.items) {
      byPath.set(item.path, item);
    }
  }
  const result: NavItem[] = [];
  for (const path of BASIC_NAV_PATHS) {
    const item = byPath.get(path);
    if (item) result.push(item);
  }
  return result;
}

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
      { path: '/admin/wrestlers', i18nKey: 'admin.panel.tabs.wrestlers' },
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
      { path: '/admin/locations', i18nKey: 'admin.panel.tabs.locations' },
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
      { path: '/admin/promos', i18nKey: 'admin.panel.tabs.promos' },
      { path: '/admin/rivalries', i18nKey: 'admin.panel.tabs.rivalries' },
      { path: '/admin/heat-config', i18nKey: 'admin.panel.tabs.heatConfig' },
    ],
  },
  {
    key: 'adminFactions',
    i18nKey: 'admin.panel.groups.factions',
    items: [
      { path: '/admin/factions', i18nKey: 'admin.panel.tabs.factions' },
      { path: '/admin/tag-teams', i18nKey: 'admin.panel.tabs.tagTeams' },
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
  const factions = ['/factions', '/tag-teams'];
  const wrestler = ['/profile', '/my-videos', '/promos', '/my-faction', '/my-tag-team'];

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
  const rosterSeasons = ['/admin/players', '/admin/divisions', '/admin/wrestlers', '/admin/transfers', '/admin/seasons', '/admin/season-awards'];
  const titlesTournaments = ['/admin/championships', '/admin/tournaments', '/admin/companies', '/admin/locations', '/admin/shows'];
  const adminRankings = ['/admin/contender-config', '/admin/contender-overrides'];
  const content = ['/admin/announcements', '/admin/videos', '/admin/storyline-requests', '/admin/promos', '/admin/rivalries', '/admin/heat-config'];
  const adminFactions = ['/admin/factions', '/admin/tag-teams'];
  const system = ['/admin/users', '/admin/features', '/admin/danger'];
  if (matchDay.some((p) => pathname === p)) return 'matchDay';
  if (rosterSeasons.some((p) => pathname === p)) return 'rosterSeasons';
  if (titlesTournaments.some((p) => pathname === p)) return 'titlesTournaments';
  if (adminRankings.some((p) => pathname === p)) return 'adminRankings';
  if (content.some((p) => pathname === p)) return 'content';
  if (adminFactions.some((p) => pathname === p)) return 'adminFactions';
  if (system.some((p) => pathname === p)) return 'system';
  return null;
}

/** Minimal translate signature so this module stays decoupled from i18next. */
export type TranslateFn = (key: string) => string;

export type PageInfo = { title: string; parent?: string };

/**
 * Path → screen title (and breadcrumb parent) for the app chrome.
 * Shared by the desktop TopBar and the mobile header so titles cannot drift.
 */
export function getPageInfo(path: string, t: TranslateFn): PageInfo {
  // Admin routes with breadcrumbs
  if (path.startsWith('/admin')) {
    const tab = path.split('/')[2];
    if (!tab) return { title: t('admin.panel.title') };

    const adminTabMap: Record<string, string> = {
      schedule: t('admin.panel.tabs.scheduleMatch'),
      events: t('admin.panel.tabs.events'),
      'standalone-matches': t('admin.panel.tabs.standaloneMatches'),
      'match-config': t('admin.panel.tabs.matchConfig'),
      seasons: t('admin.panel.tabs.seasons'),
      'season-awards': t('admin.panel.tabs.seasonAwards'),
      players: t('admin.panel.tabs.managePlayers'),
      divisions: t('admin.panel.tabs.divisions'),
      championships: t('admin.panel.tabs.championships'),
      tournaments: t('admin.panel.tabs.tournaments'),
      challenges: t('admin.panel.tabs.challenges'),
      promos: t('admin.panel.tabs.promos'),
      'contender-config': t('admin.panel.tabs.contenderConfig'),
      locations: t('admin.panel.tabs.locations'),
      users: t('admin.panel.tabs.users'),
      features: t('admin.panel.tabs.features'),
      danger: t('admin.panel.tabs.dangerZone'),
    };

    const tabToGroup: Record<string, string> = {
      schedule: t('admin.panel.groups.matchDay'),
      events: t('admin.panel.groups.matchDay'),
      'standalone-matches': t('admin.panel.groups.matchDay'),
      'match-config': t('admin.panel.groups.matchDay'),
      players: t('admin.panel.groups.rosterSeasons'),
      divisions: t('admin.panel.groups.rosterSeasons'),
      transfers: t('admin.panel.groups.rosterSeasons'),
      seasons: t('admin.panel.groups.rosterSeasons'),
      'season-awards': t('admin.panel.groups.rosterSeasons'),
      championships: t('admin.panel.groups.titlesTournaments'),
      tournaments: t('admin.panel.groups.titlesTournaments'),
      companies: t('admin.panel.groups.titlesTournaments'),
      locations: t('admin.panel.groups.titlesTournaments'),
      shows: t('admin.panel.groups.titlesTournaments'),
      'contender-config': t('admin.panel.groups.rankings'),
      'contender-overrides': t('admin.panel.groups.rankings'),
      announcements: t('admin.panel.groups.content'),
      videos: t('admin.panel.groups.content'),
      'storyline-requests': t('admin.panel.groups.content'),
      challenges: t('admin.panel.groups.content'),
      promos: t('admin.panel.groups.content'),
      factions: t('admin.panel.groups.factions'),
      'tag-teams': t('admin.panel.groups.factions'),
      users: t('admin.panel.groups.system'),
      features: t('admin.panel.groups.system'),
      danger: t('admin.panel.groups.system'),
    };

    const groupName = tabToGroup[tab];
    return {
      title: adminTabMap[tab] || t('admin.panel.title'),
      parent: groupName ? `${t('nav.admin')} / ${groupName}` : t('nav.admin'),
    };
  }

  // Events sub-routes
  if (path.match(/^\/events\/[^/]+\/results/)) {
    return { title: t('events.results.title'), parent: t('nav.events') };
  }
  if (path.match(/^\/events\/[^/]+/)) {
    return { title: t('events.detail.matchCard'), parent: t('nav.events') };
  }

  // Contender sub-routes
  if (path === '/contenders/my-status') {
    return { title: t('contenders.myStatus.title'), parent: t('nav.contenders') };
  }

  // Stats sub-routes
  if (path.startsWith('/stats/')) {
    const segment = path.split('/')[2] ?? '';
    const statsMap: Record<string, string> = {
      player: t('statistics.playerStats.title'),
      'head-to-head': t('statistics.headToHead.title'),
      leaderboards: t('statistics.leaderboards.title'),
      records: t('statistics.recordBook.title'),
      'tale-of-tape': t('statistics.taleOfTape.title'),
      achievements: t('statistics.achievements.title'),
    };
    return {
      title: statsMap[segment] || t('nav.statistics'),
      parent: t('nav.statistics'),
    };
  }

  // Challenge sub-routes
  // /challenges/issue now redirects to /promos/new — breadcrumb unreachable but kept for safety
  if (path === '/challenges/my') {
    return { title: t('challenges.my.title'), parent: t('nav.challenges') };
  }
  if (path.match(/^\/challenges\/[^/]+/)) {
    return { title: t('challenges.detail.title'), parent: t('nav.challenges') };
  }

  // Promo sub-routes
  if (path === '/promos/new') {
    return { title: t('promos.editor.title'), parent: t('nav.promos') };
  }
  if (path.match(/^\/promos\/[^/]+/)) {
    return { title: t('promos.thread.title'), parent: t('nav.promos') };
  }

  // Top-level routes
  const topLevelMap: Record<string, string> = {
    '/': t('nav.dashboard'),
    '/standings': t('nav.standings'),
    '/championships': t('nav.championships'),
    '/tournaments': t('nav.tournaments'),
    '/awards': t('nav.seasonAwards'),
    '/events': t('nav.events'),
    '/matches': t('nav.matchSearch'),
    '/contenders': t('nav.contenders'),
    '/challenges': t('nav.challenges'),
    '/promos': t('nav.promos'),
    '/stats': t('statistics.playerStats.title'),
    '/guide': t('nav.help'),
  };

  return { title: topLevelMap[path] || 'Page' };
}
