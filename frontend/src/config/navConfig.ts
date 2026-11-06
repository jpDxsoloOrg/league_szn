/**
 * Single source of truth for app navigation: the five sections, their
 * secondary tabs, and the admin registry. The desktop header, mobile tab bar,
 * Me hub, admin nav, admin hub and site search all read from this file.
 * Visibility (feature flags, roles) is applied through the helpers below.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowLeftRight,
  Award,
  BookOpen,
  Building2,
  Calendar,
  CalendarPlus,
  ChartColumn,
  CircleHelp,
  ClipboardList,
  Crown,
  FileText,
  Film,
  Flag,
  Flame,
  GitBranch,
  House,
  Layers,
  LayoutGrid,
  ListOrdered,
  Link2,
  MapPin,
  Medal,
  Megaphone,
  Mic,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Star,
  Swords,
  Target,
  Thermometer,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Tv,
  User,
  UserPlus,
  Users,
  UsersRound,
  Video,
} from 'lucide-react';
import type { SiteFeatures } from '../services/api';

export type NavFeature = 'challenges' | 'promos' | 'contenders' | 'statistics' | 'stables' | 'rivalries';

export type SectionKey = 'home' | 'events' | 'rankings' | 'storylines' | 'me';

export interface NavTab {
  path: string;
  labelKey: string;
  icon?: LucideIcon;
  /** Shown only when this feature flag is on. */
  feature?: NavFeature;
  /** Shown only to signed-in wrestlers. */
  wrestlerOnly?: boolean;
  /** Other path prefixes that belong to this tab (drill-downs, merged views). */
  matches?: string[];
  /** Third-level tabs, rendered under the secondary tabs on this tab's pages. */
  children?: NavTab[];
}

export interface NavSection {
  key: SectionKey;
  labelKey: string;
  icon: LucideIcon;
  /** Landing path when no secondary tab is visible to route to first. */
  path: string;
  tabs: NavTab[];
  /** Path prefixes that belong to the section without being a tab. */
  prefixes?: string[];
}

/** The auth and feature state that decides what a visitor sees. */
export interface NavContext {
  features: SiteFeatures;
  isAuthenticated: boolean;
  isWrestler: boolean;
  isAdminOrModerator: boolean;
  isSuperAdmin: boolean;
}

export const ME_HUB_PATH = '/me';

/** Where a guest's Sign In item leads. These pages have no secondary tabs. */
export const SIGN_IN_PATHS = [ME_HUB_PATH, '/login', '/signup', '/forgot-password', '/welcome'];

/** Colour identity for a page: its section, or the plain admin theme. */
export type SectionTheme = SectionKey | 'admin';

export const STATS_TABS: NavTab[] = [
  { path: '/stats', labelKey: 'statistics.nav.playerStats', matches: ['/stats/player'] },
  { path: '/stats/head-to-head', labelKey: 'statistics.nav.headToHead', matches: ['/stats/tale-of-tape'] },
  { path: '/stats/leaderboards', labelKey: 'statistics.nav.leaderboards', matches: ['/stats/match-types'] },
  { path: '/stats/records', labelKey: 'statistics.nav.records' },
  { path: '/stats/best-matches', labelKey: 'statistics.nav.bestMatches' },
  { path: '/stats/achievements', labelKey: 'statistics.nav.achievements' },
  { path: '/stats/rivalries', labelKey: 'nav.tabs.feudHistory' },
];

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'home',
    labelKey: 'nav.sections.home',
    icon: House,
    path: '/',
    tabs: [
      { path: '/', labelKey: 'nav.dashboard', icon: House },
      { path: '/activity', labelKey: 'nav.activity', icon: Activity },
    ],
  },
  {
    key: 'events',
    labelKey: 'nav.sections.events',
    icon: Calendar,
    path: '/events',
    tabs: [
      { path: '/events', labelKey: 'nav.tabs.calendar', icon: Calendar },
      { path: '/matches', labelKey: 'nav.tabs.matches', icon: Swords },
      { path: '/tournaments', labelKey: 'nav.tournaments', icon: GitBranch },
      { path: '/highlights', labelKey: 'nav.highlights', icon: Film },
    ],
  },
  {
    key: 'rankings',
    labelKey: 'nav.sections.rankings',
    icon: Trophy,
    path: '/standings',
    tabs: [
      { path: '/standings', labelKey: 'nav.standings', icon: ListOrdered, matches: ['/player'] },
      { path: '/championships', labelKey: 'nav.tabs.titles', icon: Crown },
      { path: '/contenders', labelKey: 'nav.contenders', icon: Target, feature: 'contenders' },
      { path: '/stats', labelKey: 'nav.statistics', icon: ChartColumn, feature: 'statistics', children: STATS_TABS },
      { path: '/awards', labelKey: 'nav.tabs.awards', icon: Award },
    ],
  },
  {
    key: 'storylines',
    labelKey: 'nav.sections.storylines',
    icon: Flame,
    path: '/rivalries',
    tabs: [
      { path: '/rivalries', labelKey: 'nav.rivalries', icon: Flame, feature: 'rivalries' },
      { path: '/promos', labelKey: 'nav.promos', icon: Mic, feature: 'promos' },
      { path: '/factions', labelKey: 'nav.factions', icon: UsersRound, feature: 'stables' },
      { path: '/tag-teams', labelKey: 'nav.tagTeams', icon: Users, feature: 'stables' },
    ],
  },
  {
    key: 'me',
    labelKey: 'nav.sections.me',
    icon: User,
    path: ME_HUB_PATH,
    tabs: [
      { path: '/profile', labelKey: 'nav.profile', icon: User, wrestlerOnly: true },
      { path: '/find-match', labelKey: 'nav.findMatch', icon: Target, wrestlerOnly: true },
      { path: '/challenges', labelKey: 'nav.tabs.callOuts', icon: Megaphone, feature: 'challenges', wrestlerOnly: true },
      { path: '/my-faction', labelKey: 'nav.myFaction', icon: Flag, feature: 'stables', wrestlerOnly: true },
      { path: '/my-tag-team', labelKey: 'nav.myTagTeam', icon: Link2, feature: 'stables', wrestlerOnly: true },
      { path: '/my-videos', labelKey: 'nav.myVideos', icon: Video, wrestlerOnly: true },
      { path: '/guide', labelKey: 'nav.help', icon: CircleHelp },
      { path: '/guide/wiki/league-rules', labelKey: 'nav.leagueRules', icon: BookOpen },
    ],
    prefixes: [ME_HUB_PATH, '/contenders/my-status', '/login', '/signup', '/forgot-password', '/welcome'],
  },
];

function pathMatches(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/';
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function longestMatch(pathname: string, prefixes: string[]): number {
  return prefixes.reduce(
    (longest, prefix) => (pathMatches(pathname, prefix) ? Math.max(longest, prefix.length) : longest),
    -1,
  );
}

function tabPrefixes(tab: NavTab): string[] {
  return [tab.path, ...(tab.matches ?? [])];
}

/** The section a path belongs to. The longest matching prefix wins. */
export function findSectionForPath(pathname: string): NavSection | null {
  let best: NavSection | null = null;
  let bestLength = -1;
  for (const section of NAV_SECTIONS) {
    const prefixes = [...section.tabs.flatMap(tabPrefixes), ...(section.prefixes ?? [])];
    const length = longestMatch(pathname, prefixes);
    if (length > bestLength) {
      best = section;
      bestLength = length;
    }
  }
  return best;
}

/**
 * The section to highlight in the main nav. For a guest the Me item reads
 * Sign In, so it only lights up on the sign-in pages themselves, not on Help.
 */
export function getActiveSectionKey(pathname: string, isAuthenticated: boolean): SectionKey | undefined {
  const key = findSectionForPath(pathname)?.key;
  const isSignInPage = SIGN_IN_PATHS.some((path) => pathMatches(pathname, path));
  return key === 'me' && !isAuthenticated && !isSignInPage ? undefined : key;
}

export function isAdminPath(pathname: string): boolean {
  return pathMatches(pathname, '/admin');
}

export function isHelpPath(pathname: string): boolean {
  return pathMatches(pathname, '/guide');
}

/** Pages outside any section, such as the 404, take the Home colour. */
export function getSectionTheme(pathname: string): SectionTheme {
  if (isAdminPath(pathname)) return 'admin';
  return findSectionForPath(pathname)?.key ?? 'home';
}

/** The tab a path belongs to within a tab list. The longest matching prefix wins. */
export function findActiveTab(tabs: NavTab[], pathname: string): NavTab | null {
  let best: NavTab | null = null;
  let bestLength = -1;
  for (const tab of tabs) {
    const length = longestMatch(pathname, tabPrefixes(tab));
    if (length > bestLength) {
      best = tab;
      bestLength = length;
    }
  }
  return best;
}

export function isTabVisible(tab: NavTab, context: NavContext): boolean {
  if (tab.feature && !context.features[tab.feature]) return false;
  if (tab.wrestlerOnly && !context.isWrestler) return false;
  return true;
}

export function getVisibleTabs(section: NavSection, context: NavContext): NavTab[] {
  return section.tabs.filter((tab) => isTabVisible(tab, context));
}

/** Sections with nothing to show are dropped, such as Storylines with all three flags off. */
export function getVisibleSections(context: NavContext): NavSection[] {
  return NAV_SECTIONS.filter((section) => section.key === 'me' || getVisibleTabs(section, context).length > 0);
}

/** Where a section's top-level link goes: its first visible tab, or the Me hub. */
export function getSectionLandingPath(section: NavSection, context: NavContext): string {
  if (section.key === 'me') return section.path;
  return getVisibleTabs(section, context)[0]?.path ?? section.path;
}

/* Admin registry ------------------------------------------------------------ */

export const ADMIN_TABS = [
  'schedule',
  'events',
  'standalone-matches',
  'users',
  'players',
  'wrestlers',
  'overalls',
  'divisions',
  'transfers',
  'tag-teams',
  'factions',
  'seasons',
  'season-awards',
  'championships',
  'tournaments',
  'contender-config',
  'contender-overrides',
  'match-config',
  'promos',
  'rivalries',
  'heat-config',
  'storyline-requests',
  'announcements',
  'videos',
  'companies',
  'shows',
  'locations',
  'features',
  'danger',
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

export type AdminMinRole = 'Moderator' | 'Admin';

export interface AdminEntry {
  tab: AdminTab;
  labelKey: string;
  icon: LucideIcon;
  /** Lowest role the API accepts for this page. */
  minRole: AdminMinRole;
  danger?: boolean;
}

export interface AdminGroup {
  key: string;
  labelKey: string;
  entries: AdminEntry[];
}

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    key: 'matchDay',
    labelKey: 'admin.panel.groups.matchDay',
    entries: [
      { tab: 'schedule', labelKey: 'admin.panel.tabs.scheduleMatch', icon: CalendarPlus, minRole: 'Moderator' },
      { tab: 'events', labelKey: 'admin.panel.tabs.matchCards', icon: Layers, minRole: 'Moderator' },
      { tab: 'standalone-matches', labelKey: 'admin.panel.tabs.standaloneMatches', icon: ClipboardList, minRole: 'Moderator' },
    ],
  },
  {
    key: 'roster',
    labelKey: 'admin.panel.groups.roster',
    entries: [
      { tab: 'users', labelKey: 'admin.panel.tabs.users', icon: UserPlus, minRole: 'Admin' },
      { tab: 'players', labelKey: 'admin.panel.tabs.managePlayers', icon: User, minRole: 'Moderator' },
      { tab: 'wrestlers', labelKey: 'admin.panel.tabs.wrestlers', icon: Swords, minRole: 'Moderator' },
      { tab: 'overalls', labelKey: 'overalls.admin.title', icon: TrendingUp, minRole: 'Moderator' },
      { tab: 'divisions', labelKey: 'admin.panel.tabs.divisions', icon: LayoutGrid, minRole: 'Moderator' },
      { tab: 'transfers', labelKey: 'admin.panel.tabs.transfers', icon: ArrowLeftRight, minRole: 'Moderator' },
      { tab: 'tag-teams', labelKey: 'admin.panel.tabs.tagTeams', icon: Users, minRole: 'Moderator' },
      { tab: 'factions', labelKey: 'admin.panel.tabs.factions', icon: UsersRound, minRole: 'Moderator' },
    ],
  },
  {
    key: 'competition',
    labelKey: 'admin.panel.groups.competition',
    entries: [
      { tab: 'seasons', labelKey: 'admin.panel.tabs.seasons', icon: RefreshCw, minRole: 'Moderator' },
      { tab: 'season-awards', labelKey: 'admin.panel.tabs.seasonAwards', icon: Star, minRole: 'Moderator' },
      { tab: 'championships', labelKey: 'admin.panel.tabs.championships', icon: Medal, minRole: 'Moderator' },
      { tab: 'tournaments', labelKey: 'admin.panel.tabs.tournaments', icon: GitBranch, minRole: 'Moderator' },
      { tab: 'contender-config', labelKey: 'admin.panel.tabs.contenderConfig', icon: ChartColumn, minRole: 'Moderator' },
      { tab: 'contender-overrides', labelKey: 'admin.panel.tabs.contenderOverrides', icon: SlidersHorizontal, minRole: 'Moderator' },
      { tab: 'match-config', labelKey: 'admin.panel.tabs.matchConfig', icon: SlidersHorizontal, minRole: 'Moderator' },
    ],
  },
  {
    key: 'storylinesContent',
    labelKey: 'admin.panel.groups.storylinesContent',
    entries: [
      { tab: 'promos', labelKey: 'admin.panel.tabs.promos', icon: Mic, minRole: 'Moderator' },
      { tab: 'rivalries', labelKey: 'admin.panel.tabs.rivalries', icon: Flame, minRole: 'Moderator' },
      { tab: 'heat-config', labelKey: 'admin.panel.tabs.heatConfig', icon: Thermometer, minRole: 'Admin' },
      { tab: 'storyline-requests', labelKey: 'admin.panel.tabs.storylineRequests', icon: FileText, minRole: 'Moderator' },
      { tab: 'announcements', labelKey: 'admin.panel.tabs.announcements', icon: Megaphone, minRole: 'Moderator' },
      { tab: 'videos', labelKey: 'admin.panel.tabs.videos', icon: Video, minRole: 'Moderator' },
    ],
  },
  {
    key: 'leagueSetup',
    labelKey: 'admin.panel.groups.leagueSetup',
    entries: [
      { tab: 'companies', labelKey: 'admin.panel.tabs.companies', icon: Building2, minRole: 'Moderator' },
      { tab: 'shows', labelKey: 'admin.panel.tabs.shows', icon: Tv, minRole: 'Moderator' },
      { tab: 'locations', labelKey: 'admin.panel.tabs.locations', icon: MapPin, minRole: 'Moderator' },
      { tab: 'features', labelKey: 'admin.panel.tabs.features', icon: Flag, minRole: 'Moderator' },
      { tab: 'danger', labelKey: 'admin.panel.tabs.dangerZone', icon: TriangleAlert, minRole: 'Admin', danger: true },
    ],
  },
];

export const ADMIN_NAV_ICON = Shield;

export function getAdminPath(tab: AdminTab): string {
  return `/admin/${tab}`;
}

export function isAdminTab(value: string | undefined): value is AdminTab {
  return ADMIN_TABS.some((tab) => tab === value);
}

export function canAccessAdminEntry(entry: AdminEntry, isSuperAdmin: boolean): boolean {
  return entry.minRole === 'Moderator' || isSuperAdmin;
}

export function findAdminEntry(tab: AdminTab): AdminEntry | undefined {
  return ADMIN_GROUPS.flatMap((group) => group.entries).find((entry) => entry.tab === tab);
}

/** Admin groups trimmed to what the viewer may open. */
export function getVisibleAdminGroups(isSuperAdmin: boolean): AdminGroup[] {
  return ADMIN_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => canAccessAdminEntry(entry, isSuperAdmin)),
  })).filter((group) => group.entries.length > 0);
}

/* Page titles ---------------------------------------------------------------- */

/** Minimal translate signature so this module stays decoupled from i18next. */
export type TranslateFn = (key: string) => string;

export type PageInfo = { title: string; parent?: string };

const STATIC_TITLE_KEYS: Record<string, string> = {
  '/login': 'common.signIn',
  '/signup': 'common.signUp',
  '/forgot-password': 'nav.pages.forgotPassword',
  '/welcome': 'nav.pages.welcome',
  [ME_HUB_PATH]: 'nav.sections.me',
  '/contenders/my-status': 'contenders.myStatus.title',
  '/challenges/my': 'challenges.my.title',
  '/promos/new': 'promos.editor.title',
  '/factions/standings': 'nav.factions',
  '/stats/player': 'statistics.playerStats.title',
  '/stats/head-to-head': 'statistics.headToHead.title',
  '/stats/leaderboards': 'statistics.leaderboards.title',
  '/stats/records': 'statistics.recordBook.title',
  '/stats/rivalries': 'nav.tabs.feudHistory',
  '/stats/tale-of-tape': 'statistics.taleOfTape.title',
  '/stats/achievements': 'statistics.achievements.title',
  '/stats/best-matches': 'statistics.nav.bestMatches',
  '/stats/match-types': 'statistics.nav.matchTypeLeaderboards',
  '/stats': 'statistics.playerStats.title',
};

const DETAIL_TITLES: { pattern: RegExp; titleKey: string; parentKey: string }[] = [
  { pattern: /^\/events\/[^/]+\/results/, titleKey: 'events.results.title', parentKey: 'nav.events' },
  { pattern: /^\/events\/[^/]+/, titleKey: 'events.detail.matchCard', parentKey: 'nav.events' },
  { pattern: /^\/challenges\/[^/]+/, titleKey: 'challenges.detail.title', parentKey: 'nav.tabs.callOuts' },
  { pattern: /^\/promos\/[^/]+/, titleKey: 'promos.thread.title', parentKey: 'nav.promos' },
  { pattern: /^\/rivalries\/[^/]+/, titleKey: 'nav.rivalries', parentKey: 'nav.rivalries' },
  { pattern: /^\/factions\/.+/, titleKey: 'nav.factions', parentKey: 'nav.factions' },
  { pattern: /^\/tag-teams\/[^/]+/, titleKey: 'nav.tagTeams', parentKey: 'nav.tagTeams' },
];

function getAdminPageInfo(path: string, t: TranslateFn): PageInfo {
  const tab = path.split('/')[2];
  if (!tab) return { title: t('admin.panel.title') };
  for (const group of ADMIN_GROUPS) {
    const entry = group.entries.find((candidate) => candidate.tab === tab);
    if (entry) return { title: t(entry.labelKey), parent: `${t('nav.admin')} / ${t(group.labelKey)}` };
  }
  return { title: t('admin.panel.title'), parent: t('nav.admin') };
}

/** Path to screen title and breadcrumb parent, from the same registry as the nav. */
export function getPageInfo(path: string, t: TranslateFn): PageInfo {
  if (path === '/admin' || path.startsWith('/admin/')) return getAdminPageInfo(path, t);

  const staticPrefix = Object.keys(STATIC_TITLE_KEYS)
    .filter((prefix) => pathMatches(path, prefix))
    .sort((first, second) => second.length - first.length)[0];
  if (staticPrefix) {
    const titleKey = STATIC_TITLE_KEYS[staticPrefix] as string;
    return path.startsWith('/stats/')
      ? { title: t(titleKey), parent: t('nav.statistics') }
      : { title: t(titleKey) };
  }

  const detail = DETAIL_TITLES.find(({ pattern }) => pattern.test(path));
  if (detail) return { title: t(detail.titleKey), parent: t(detail.parentKey) };

  if (path.startsWith('/player/')) return { title: t('nav.pages.playerProfile') };
  if (path.startsWith('/guide')) return { title: t('nav.help') };

  const section = findSectionForPath(path);
  const tab = section ? findActiveTab(section.tabs, path) : null;
  return { title: tab ? t(tab.labelKey) : t('notFound.title') };
}
