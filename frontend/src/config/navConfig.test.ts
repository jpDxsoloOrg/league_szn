import { describe, it, expect } from 'vitest';
import en from '../i18n/locales/en.json';
import de from '../i18n/locales/de.json';
import {
  ADMIN_GROUPS,
  ADMIN_TABS,
  NAV_SECTIONS,
  STATS_TABS,
  canAccessAdminEntry,
  findActiveTab,
  findSectionForPath,
  getPageInfo,
  getSectionLandingPath,
  getVisibleAdminGroups,
  getVisibleSections,
  getVisibleTabs,
  type NavContext,
  type NavSection,
} from './navConfig';

const ALL_ON = { challenges: true, promos: true, contenders: true, statistics: true, stables: true, notifications: true, rivalries: true };

function context(overrides: Partial<NavContext> = {}): NavContext {
  return { features: ALL_ON, isAuthenticated: true, isWrestler: true, isAdminOrModerator: false, isSuperAdmin: false, ...overrides };
}

function section(key: string): NavSection {
  const found = NAV_SECTIONS.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`no section ${key}`);
  return found;
}

function hasKey(tree: unknown, key: string): boolean {
  let node = tree;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}

describe('section routing', () => {
  it.each([
    ['/', 'home'],
    ['/activity', 'home'],
    ['/events', 'events'],
    ['/events/e1/commentary', 'events'],
    ['/tournaments', 'events'],
    ['/highlights', 'events'],
    ['/standings', 'rankings'],
    ['/stats/tale-of-tape', 'rankings'],
    ['/contenders', 'rankings'],
    ['/contenders/my-status', 'me'],
    ['/awards', 'rankings'],
    ['/rivalries/r1/timeline', 'storylines'],
    ['/promos/new', 'storylines'],
    ['/factions/standings', 'storylines'],
    ['/tag-teams/t1', 'storylines'],
    ['/profile', 'me'],
    ['/find-match', 'me'],
    ['/challenges/c1', 'me'],
    ['/guide/wiki/league-rules', 'me'],
    ['/login', 'me'],
    ['/me', 'me'],
  ])('puts %s in %s', (path, key) => {
    expect(findSectionForPath(path)?.key).toBe(key);
  });

  it('leaves admin and unknown paths without a section', () => {
    expect(findSectionForPath('/admin/players')).toBeNull();
    expect(findSectionForPath('/nowhere')).toBeNull();
  });

  it('does not match a path that only shares a prefix', () => {
    expect(findSectionForPath('/eventsfoo')).toBeNull();
  });

  it('picks the most specific tab', () => {
    expect(findActiveTab(section('me').tabs, '/guide/wiki/league-rules')?.path).toBe('/guide/wiki/league-rules');
    expect(findActiveTab(section('me').tabs, '/guide/wiki/faqs')?.path).toBe('/guide');
    expect(findActiveTab(STATS_TABS, '/stats/player/p1')?.path).toBe('/stats');
    expect(findActiveTab(STATS_TABS, '/stats/tale-of-tape')?.path).toBe('/stats/head-to-head');
    expect(findActiveTab(STATS_TABS, '/stats/match-types')?.path).toBe('/stats/leaderboards');
  });
});

describe('flag and role visibility', () => {
  it('hides a tab when its flag is off, and keeps Standings', () => {
    const features = { ...ALL_ON, statistics: false, contenders: false };
    const paths = getVisibleTabs(section('rankings'), context({ features })).map((tab) => tab.path);
    expect(paths).toEqual(['/standings', '/championships', '/awards']);
  });

  it('hides Storylines only when all three flags are off', () => {
    const someOff = { ...ALL_ON, rivalries: false, promos: false };
    expect(getVisibleSections(context({ features: someOff })).map((item) => item.key)).toContain('storylines');
    const allOff = { ...someOff, stables: false };
    expect(getVisibleSections(context({ features: allOff })).map((item) => item.key)).not.toContain('storylines');
  });

  it('routes Storylines to the first enabled tab', () => {
    const features = { ...ALL_ON, rivalries: false, promos: false };
    expect(getSectionLandingPath(section('storylines'), context({ features }))).toBe('/factions');
  });

  it('shows wrestler items only to wrestlers', () => {
    const visitor = context({ isAuthenticated: false, isWrestler: false });
    expect(getVisibleTabs(section('me'), visitor).map((tab) => tab.path)).toEqual(['/guide', '/guide/wiki/league-rules']);
    expect(getVisibleTabs(section('me'), context()).map((tab) => tab.path)).toContain('/find-match');
  });
});

describe('admin registry', () => {
  const entries = ADMIN_GROUPS.flatMap((group) => group.entries);

  it('lists every admin tab exactly once in five groups', () => {
    expect(ADMIN_GROUPS).toHaveLength(5);
    expect(entries.map((entry) => entry.tab).sort()).toEqual([...ADMIN_TABS].sort());
  });

  it('limits users, heat-config and danger to full Admins', () => {
    const adminOnly = entries.filter((entry) => !canAccessAdminEntry(entry, false)).map((entry) => entry.tab);
    expect(adminOnly.sort()).toEqual(['danger', 'heat-config', 'users']);
  });

  it('trims the groups for Moderators', () => {
    const tabs = getVisibleAdminGroups(false).flatMap((group) => group.entries.map((entry) => entry.tab));
    expect(tabs).toHaveLength(ADMIN_TABS.length - 3);
    expect(tabs).toContain('overalls');
  });
});

describe('getPageInfo', () => {
  const t = (key: string) => key;

  it('gives every admin tab its own title', () => {
    const titles = ADMIN_TABS.map((tab) => getPageInfo(`/admin/${tab}`, t).title);
    expect(new Set(titles).size).toBe(ADMIN_TABS.length);
  });

  it.each([
    ['/login', 'common.signIn'],
    ['/signup', 'common.signUp'],
    ['/forgot-password', 'nav.pages.forgotPassword'],
    ['/welcome', 'nav.pages.welcome'],
    ['/stats/rivalries', 'nav.tabs.feudHistory'],
    ['/stats/best-matches', 'statistics.nav.bestMatches'],
    ['/standings', 'nav.standings'],
    ['/promos/new', 'promos.editor.title'],
    ['/promos/p1', 'promos.thread.title'],
    ['/nowhere', 'notFound.title'],
  ])('titles %s', (path, title) => {
    expect(getPageInfo(path, t).title).toBe(title);
  });
});

describe('translations', () => {
  const keys = [
    ...NAV_SECTIONS.flatMap((item) => [item.labelKey, ...item.tabs.map((tab) => tab.labelKey)]),
    ...STATS_TABS.map((tab) => tab.labelKey),
    ...ADMIN_GROUPS.flatMap((group) => [group.labelKey, ...group.entries.map((entry) => entry.labelKey)]),
  ];

  it.each([
    ['en', en],
    ['de', de],
  ])('has every nav label in %s', (_language, locale) => {
    const missing = keys.filter((key) => !hasKey(locale, key));
    expect(missing).toEqual([]);
  });
});
