import type { TFunction } from 'i18next';
import type { TickerItem } from '../ui/Ticker';
import type { LeaguePulse } from '../../hooks/useLeaguePulse';
import type { EnrichedMatchData } from '../../types/event';
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
  const outcome = losers.length === 0
    ? `${winners.join(' vs ')} (${t('dashboard.draw')})`
    : `${winners.join(' & ')} ${t('dashboard.def')} ${losers.join(' & ')}`;
  return match.isChampionship && match.championshipName ? `${outcome} · ${match.championshipName}` : outcome;
}

/**
 * Headlines for the crawl, built only from what the API returned: shows still
 * to come, news, then the latest shows' results, one show after another in
 * card order with the show's name on every result.
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
    items.push({ id: `news-${article.announcementId}`, tag: t('ticker.tags.news'), tagTone: 'data', text: article.title, to: `/news/${article.announcementId}` });
  }

  for (const show of pulse.recentShows) {
    const showTag = `${show.name} · ${formatCalendarDate(show.date, locale, SHORT_DATE)}`;
    const card = [...show.enrichedMatches].sort((first, second) => first.position - second.position);
    for (const entry of card) {
      const text = entry.matchData ? describeResult(entry.matchData, t) : null;
      if (!text || !entry.matchData) continue;
      items.push({
        id: `result-${show.eventId}-${entry.matchId}`,
        tag: showTag,
        tagTone: entry.matchData.isChampionship ? 'prestige' : 'data',
        text,
        to: `/events/${show.eventId}/results`,
      });
    }
  }

  return items;
}
