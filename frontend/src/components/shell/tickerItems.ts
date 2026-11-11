import type { TFunction } from 'i18next';
import type { TickerItem } from '../ui/Ticker';
import type { LeaguePulse } from '../../hooks/useLeaguePulse';
import type { EnrichedMatchData, EventWithMatches } from '../../types/event';
import { formatCalendarDate } from '../../utils/dateUtils';

const NEWS_SHOWN = 3;
const SHORT_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

function namesOf(match: EnrichedMatchData, playerIds: string[] | undefined): string[] {
  const ids = new Set(playerIds ?? []);
  return match.participants.filter((participant) => ids.has(participant.playerId)).map((participant) => participant.wrestlerName);
}

/** "A def. B & C", or "A vs B (draw)". Null for a match with no result to report. */
export function describeResult(match: EnrichedMatchData, t: TFunction): string | null {
  if (match.status !== 'completed') return null;
  const winners = namesOf(match, match.winners);
  const losers = namesOf(match, match.losers);
  if (winners.length === 0) return null;
  // A draw is stored with every participant as a winner and no losers.
  return losers.length === 0
    ? `${winners.join(' vs ')} (${t('dashboard.draw')})`
    : `${winners.join(' & ')} ${t('dashboard.def')} ${losers.join(' & ')}`;
}

/**
 * One finished show as a run of headlines: the show's name once, then each
 * result in card order. A title match carries the title as a gold tag. A show
 * with no results to report adds nothing.
 */
function showResultItems(show: EventWithMatches, t: TFunction, locale?: string): TickerItem[] {
  const to = `/events/${show.eventId}/results`;
  const card = [...show.enrichedMatches].sort((first, second) => first.position - second.position);
  const results: TickerItem[] = [];
  for (const entry of card) {
    const match = entry.matchData;
    const text = match ? describeResult(match, t) : null;
    if (!match || !text) continue;
    const title = match.isChampionship ? match.championshipName : undefined;
    results.push({
      id: `result-${show.eventId}-${entry.matchId}`,
      ...(title ? { tag: title, tagTone: 'prestige' as const } : {}),
      text,
      to,
    });
  }
  if (results.length === 0) return [];
  return [
    {
      id: `results-${show.eventId}`,
      tag: t('ticker.tags.results'),
      tagTone: 'data',
      text: `${show.name} · ${formatCalendarDate(show.date, locale, SHORT_DATE)}`,
      to,
    },
    ...results,
  ];
}

/**
 * Headlines for the crawl, built only from what the API returned: shows still
 * to come, news, the current champions, then the latest shows' results. Results run newest show
 * first, each show named once and followed by its matches in card order.
 */
export function buildTickerItems(pulse: LeaguePulse, t: TFunction, locale?: string): TickerItem[] {
  const items: TickerItem[] = [];

  for (const show of pulse.upcomingShows) {
    const live = show.status === 'in-progress';
    items.push({
      id: `show-${show.eventId}`,
      tag: live ? t('ticker.tags.live') : t('ticker.tags.upcoming'),
      tagTone: 'action',
      text: live ? show.name : `${show.name} · ${formatCalendarDate(show.date, locale, SHORT_DATE)}`,
      to: `/events/${show.eventId}`,
    });
  }

  for (const article of pulse.news.slice(0, NEWS_SHOWN)) {
    items.push({ id: `news-${article.announcementId}`, tag: t('ticker.tags.news'), tagTone: 'prestige', text: article.title, to: `/news/${article.announcementId}` });
  }

  // Before the results, so a long run of results cannot push them past the crawl's limit.
  for (const champion of pulse.dashboard?.currentChampions ?? []) {
    items.push({
      id: `champion-${champion.championshipId}`,
      tag: t('ticker.tags.champion'),
      tagTone: 'prestige',
      text: `${champion.championName} · ${champion.championshipName}`,
      to: '/championships',
      ...(champion.championshipImageUrl ? { iconUrl: champion.championshipImageUrl } : {}),
    });
  }

  // recentShows arrives newest first.
  for (const show of pulse.recentShows) {
    items.push(...showResultItems(show, t, locale));
  }

  return items;
}
