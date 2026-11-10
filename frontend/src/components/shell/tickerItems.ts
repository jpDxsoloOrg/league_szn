import type { TFunction } from 'i18next';
import type { TickerItem } from '../ui/Ticker';
import type { LeaguePulse } from '../../hooks/useLeaguePulse';
import { formatCalendarDate } from '../../utils/dateUtils';

const NEWS_SHOWN = 3;
const RESULTS_SHOWN = 5;
const SHORT_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

/** Headlines for the crawl, built only from what the API returned. */
export function buildTickerItems(pulse: LeaguePulse, t: TFunction, locale?: string): TickerItem[] {
  const { dashboard, news } = pulse;
  const items: TickerItem[] = [];

  for (const event of dashboard?.inProgressEvents ?? []) {
    items.push({ id: `live-${event.eventId}`, tag: t('ticker.tags.live'), tagTone: 'action', text: event.name, to: `/events/${event.eventId}` });
  }

  const nextEvent = dashboard?.upcomingEvents[0];
  if (nextEvent) {
    items.push({
      id: `next-${nextEvent.eventId}`,
      tag: t('ticker.tags.nextUp'),
      tagTone: 'action',
      text: `${nextEvent.name} · ${formatCalendarDate(nextEvent.date, locale, SHORT_DATE)}`,
      to: `/events/${nextEvent.eventId}`,
    });
  }

  for (const article of news.slice(0, NEWS_SHOWN)) {
    items.push({ id: `news-${article.announcementId}`, tag: t('ticker.tags.news'), tagTone: 'data', text: article.title, to: `/news/${article.announcementId}` });
  }

  for (const match of (dashboard?.recentResults ?? []).slice(0, RESULTS_SHOWN)) {
    const outcome = match.isDraw
      ? `${match.participantsName ?? ''} ${t('dashboard.draw')}`.trim()
      : `${match.winnerName} ${t('dashboard.def')} ${match.loserName}`;
    const isTitleMatch = Boolean(match.isChampionship && match.championshipName);
    items.push({
      id: `result-${match.matchId}`,
      tag: isTitleMatch ? t('ticker.tags.titleMatch') : t('ticker.tags.result'),
      tagTone: isTitleMatch ? 'prestige' : 'data',
      text: isTitleMatch ? `${outcome} · ${match.championshipName}` : outcome,
      to: match.eventId ? `/events/${match.eventId}` : '/matches',
    });
  }

  for (const champion of dashboard?.currentChampions ?? []) {
    items.push({
      id: `champion-${champion.championshipId}`,
      tag: t('ticker.tags.champion'),
      tagTone: 'prestige',
      text: `${champion.championName} · ${champion.championshipName}`,
      to: '/championships',
    });
  }

  return items;
}
