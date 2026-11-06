import type { LeagueEvent } from '../../types/event';
import type { Championship } from '../../types';
import type { PlayerDirectoryEntry } from '../../services/api';
import {
  ADMIN_GROUPS,
  NAV_SECTIONS,
  canAccessAdminEntry,
  getAdminPath,
  getVisibleSections,
  getVisibleTabs,
  isTabVisible,
  type NavContext,
  type TranslateFn,
} from '../../config/navConfig';

export type SearchEntryKind = 'wrestler' | 'event' | 'championship' | 'page';

export interface SearchEntry {
  id: string;
  kind: SearchEntryKind;
  title: string;
  subtitle?: string;
  to: string;
}

const NO_WRESTLER_PLACEHOLDER = 'needs wrestler';

function hasWrestler(wrestler: string | null): wrestler is string {
  const normalized = wrestler?.trim().toLowerCase();
  return Boolean(normalized) && normalized !== NO_WRESTLER_PLACEHOLDER;
}

/** Players are listed by wrestler. Anyone without a real wrestler stays out. */
export function toWrestlerEntries(players: PlayerDirectoryEntry[]): SearchEntry[] {
  return players.flatMap((player) => (
    hasWrestler(player.currentWrestler)
      ? [{
        id: `wrestler-${player.playerId}`,
        kind: 'wrestler' as const,
        title: player.currentWrestler,
        subtitle: player.name,
        to: `/player/${player.playerId}`,
      }]
      : []
  ));
}

export function toEventEntries(events: LeagueEvent[]): SearchEntry[] {
  return events.map((event) => ({
    id: `event-${event.eventId}`,
    kind: 'event',
    title: event.name,
    subtitle: new Date(event.date).toLocaleDateString(),
    to: `/events/${event.eventId}`,
  }));
}

export function toChampionshipEntries(championships: Championship[]): SearchEntry[] {
  return championships
    .filter((championship) => championship.isActive !== false)
    .map((championship) => ({
      id: `championship-${championship.championshipId}`,
      kind: 'championship',
      title: championship.name,
      to: '/championships',
    }));
}

/** Every page the visitor can open, from the same registry as the nav. */
export function toPageEntries(context: NavContext, t: TranslateFn): SearchEntry[] {
  const visibleKeys = new Set(getVisibleSections(context).map((section) => section.key));

  const pages = NAV_SECTIONS
    .filter((section) => visibleKeys.has(section.key))
    .flatMap((section) => getVisibleTabs(section, context).flatMap((tab) => {
      const children = (tab.children ?? []).filter((child) => isTabVisible(child, context));
      return [tab, ...children].map((page) => ({
        id: `page-${page.path}`,
        kind: 'page' as const,
        title: t(page.labelKey),
        subtitle: t(section.labelKey),
        to: page.path,
      }));
    }));

  if (!context.isAdminOrModerator) return dedupeByPath(pages);

  const adminPages = ADMIN_GROUPS.flatMap((group) => group.entries
    .filter((entry) => canAccessAdminEntry(entry, context.isSuperAdmin))
    .map((entry) => ({
      id: `page-${entry.tab}`,
      kind: 'page' as const,
      title: t(entry.labelKey),
      subtitle: `${t('nav.admin')} / ${t(group.labelKey)}`,
      to: getAdminPath(entry.tab),
    })));

  return dedupeByPath([...pages, ...adminPages]);
}

function dedupeByPath(entries: SearchEntry[]): SearchEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.to)) return false;
    seen.add(entry.to);
    return true;
  });
}
