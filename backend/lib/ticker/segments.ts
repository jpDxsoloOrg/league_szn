/**
 * League ticker segments (TKR-01).
 *
 * Every builder here is pure: it takes already-loaded rows plus the current
 * time and returns one segment, or `null` when it has nothing to say. The
 * handler (`functions/dashboard/getTicker.ts`) does the I/O and hands the
 * results to `assembleTickerSegments`, which drops empty segments and orders
 * the rest by priority.
 */

/** One headline in a segment. `text` is ready to show. */
export interface TickerItem {
  text: string;
  href?: string;
  /**
   * Optional i18n key for templated text ("Next PPV in 3 days"). The frontend
   * may translate with `textParams`; `text` is the English fallback.
   */
  textKey?: string;
  textParams?: Record<string, string | number>;
}

export type TickerSegmentKey =
  | 'pinned'
  | 'tonight'
  | 'newChampions'
  | 'potentialCallups'
  | 'promotionWatch'
  | 'hotRivalries'
  | 'custom'
  | 'news'
  | 'upcomingShows'
  | 'champions'
  | 'latestResults';

export interface TickerSegment {
  key: TickerSegmentKey;
  /** i18n key for the segment's pill label, e.g. `ticker.segments.tonight`. */
  labelKey: string;
  items: TickerItem[];
  /** Lower comes first. */
  priority: number;
}

export interface TickerResponse {
  segments: TickerSegment[];
  generatedAt: string;
}

/** Lower comes first. Pinned GM messages always lead. */
export const TICKER_PRIORITY: Readonly<Record<TickerSegmentKey, number>> = {
  pinned: 0,
  tonight: 10,
  newChampions: 20,
  potentialCallups: 30,
  promotionWatch: 35,
  hotRivalries: 40,
  custom: 50,
  news: 60,
  upcomingShows: 70,
  champions: 80,
  latestResults: 90,
};

/** Every segment key, in priority order. */
export const TICKER_SEGMENT_KEYS: readonly TickerSegmentKey[] = (Object.keys(TICKER_PRIORITY) as TickerSegmentKey[])
  .sort((first, second) => TICKER_PRIORITY[first] - TICKER_PRIORITY[second]);

export const NEW_CHAMPION_WINDOW_DAYS = 7;
export const NEWS_SHOWN = 3;
export const UPCOMING_SHOWS_SHOWN = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

function segment(key: TickerSegmentKey, items: TickerItem[]): TickerSegment | null {
  if (items.length === 0) return null;
  return { key, labelKey: `ticker.segments.${key}`, items, priority: TICKER_PRIORITY[key] };
}

/** `YYYY-MM-DD` of a date string or a Date, read in UTC. */
function calendarDay(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);
}

// ─── Inputs ────────────────────────────────────────────────────────────

/** A player flagged on a progression track, already filtered for visibility. */
export interface ConsideredPlayer {
  playerId: string;
  /** The billed name: wrestler name, else the player's own. */
  displayName: string;
}

export interface TickerEventInput {
  eventId: string;
  name: string;
  eventType: string;
  date: string;
  status: string;
}

export interface ChampionshipChangeInput {
  championshipId: string;
  championshipName: string;
  championName: string;
  wonDate: string;
}

export interface CurrentChampionInput {
  championshipName: string;
  championName: string;
}

export interface HotRivalryInput {
  rivalryId: string;
  title: string;
  heat: string;
}

export interface NewsInput {
  announcementId: string;
  title: string;
  /** ISO date; newer stories lead. */
  createdAt?: string;
}

export interface CustomTickerMessageInput {
  text: string;
  href?: string;
  pinned: boolean;
}

export interface ResultLineInput {
  /** Card position; results are listed in card order. */
  position: number;
  text: string;
}

export interface LatestShowInput {
  eventId: string;
  name: string;
  results: ResultLineInput[];
}

// ─── Builders ──────────────────────────────────────────────────────────

/** "Potential Call-Ups: A · B · C", one item per player, newest mark first. */
export function buildPotentialCallupsSegment(players: ConsideredPlayer[]): TickerSegment | null {
  return segment('potentialCallups', players.map((player) => ({ text: player.displayName, href: `/player/${player.playerId}` })));
}

/** Same shape as call-ups, for the promotion track. Not wired until DMV-04 lands. */
export function buildPromotionWatchSegment(players: ConsideredPlayer[]): TickerSegment | null {
  return segment('promotionWatch', players.map((player) => ({ text: player.displayName, href: `/player/${player.playerId}` })));
}

/** Title changes won in the last `NEW_CHAMPION_WINDOW_DAYS` days, newest first. */
export function buildNewChampionsSegment(changes: ChampionshipChangeInput[], now: Date): TickerSegment | null {
  const cutoff = now.getTime() - NEW_CHAMPION_WINDOW_DAYS * DAY_MS;
  const items = changes
    .filter((change) => {
      const wonAt = Date.parse(change.wonDate);
      return Number.isFinite(wonAt) && wonAt >= cutoff && wonAt <= now.getTime();
    })
    .sort((first, second) => second.wonDate.localeCompare(first.wonDate))
    .map((change) => ({
      text: `${change.championName} · ${change.championshipName}`,
      textKey: 'ticker.newChampionText',
      textParams: { champion: change.championName, championship: change.championshipName },
      href: '/championships',
    }));
  return segment('newChampions', items);
}

/**
 * Shows under way or dated today, then "Next PPV in N days" for the nearest
 * pay-per-view after today. Days are UTC calendar days, matching how event
 * dates are stored.
 */
export function buildTonightSegment(events: TickerEventInput[], now: Date): TickerSegment | null {
  const today = calendarDay(now);
  const live = events.filter((event) => event.status === 'in-progress');
  const todays = events.filter((event) => event.status === 'upcoming' && calendarDay(event.date) === today);
  const items: TickerItem[] = [...live, ...todays].map((event) => ({ text: event.name, href: `/events/${event.eventId}` }));

  const nextPpv = events
    .filter((event) => event.status === 'upcoming' && event.eventType === 'ppv' && calendarDay(event.date) > today)
    .sort((first, second) => calendarDay(first.date).localeCompare(calendarDay(second.date)))[0];
  if (nextPpv) {
    const days = daysBetween(today, calendarDay(nextPpv.date));
    items.push({
      text: `Next PPV in ${days} ${days === 1 ? 'day' : 'days'}: ${nextPpv.name}`,
      textKey: 'ticker.nextPpvText',
      textParams: { count: days, name: nextPpv.name },
      href: `/events/${nextPpv.eventId}`,
    });
  }
  return segment('tonight', items);
}

/** Upcoming shows after today, soonest first. Today's shows belong to `tonight`. */
export function buildUpcomingShowsSegment(events: TickerEventInput[], now: Date): TickerSegment | null {
  const today = calendarDay(now);
  const items = events
    .filter((event) => event.status === 'upcoming' && calendarDay(event.date) > today)
    .sort((first, second) => calendarDay(first.date).localeCompare(calendarDay(second.date)))
    .slice(0, UPCOMING_SHOWS_SHOWN)
    .map((event) => ({
      text: `${event.name} · ${calendarDay(event.date)}`,
      href: `/events/${event.eventId}`,
    }));
  return segment('upcomingShows', items);
}

const HOT_TIERS: ReadonlySet<string> = new Set(['hot', 'scorching']);

/** Rivalries at the hot heat tier or above. Callers pass only public ones. */
export function buildHotRivalriesSegment(rivalries: HotRivalryInput[]): TickerSegment | null {
  const items = rivalries
    .filter((rivalry) => HOT_TIERS.has(rivalry.heat))
    // Scorching ahead of hot.
    .sort((first, second) => Number(second.heat === 'scorching') - Number(first.heat === 'scorching'))
    .map((rivalry) => ({ text: rivalry.title, href: `/rivalries/${rivalry.rivalryId}` }));
  return segment('hotRivalries', items);
}

/**
 * GM messages split in two: pinned ones lead the whole ticker, the rest sit
 * at their normal priority. Callers pass only messages that are live now.
 */
export function buildCustomSegments(messages: CustomTickerMessageInput[]): TickerSegment[] {
  const toItem = (message: CustomTickerMessageInput): TickerItem =>
    (message.href ? { text: message.text, href: message.href } : { text: message.text });
  const pinned = segment('pinned', messages.filter((message) => message.pinned).map(toItem));
  const rest = segment('custom', messages.filter((message) => !message.pinned).map(toItem));
  return [pinned, rest].filter((built): built is TickerSegment => built !== null);
}

/**
 * The newest `NEWS_SHOWN` active announcements, newest first like the News
 * page. The repository lists by priority, so an old Breaking post would
 * otherwise lead.
 */
export function buildNewsSegment(news: NewsInput[]): TickerSegment | null {
  const newestFirst = [...news].sort((first, second) => (second.createdAt ?? '').localeCompare(first.createdAt ?? ''));
  return segment('news', newestFirst.slice(0, NEWS_SHOWN).map((article) => ({ text: article.title, href: `/news/${article.announcementId}` })));
}

export function buildChampionsSegment(champions: CurrentChampionInput[]): TickerSegment | null {
  return segment('champions', champions.map((champion) => ({
    text: `${champion.championName} · ${champion.championshipName}`,
    href: '/championships',
  })));
}

/** The last finished show: its name once, then each result in card order. */
export function buildLatestResultsSegment(show: LatestShowInput | null): TickerSegment | null {
  if (!show || show.results.length === 0) return null;
  const href = `/events/${show.eventId}/results`;
  const results = [...show.results]
    .sort((first, second) => first.position - second.position)
    .map((result) => ({ text: result.text, href }));
  return segment('latestResults', [{ text: show.name, href }, ...results]);
}

export interface ResultMatchInput {
  participants: string[];
  teams?: string[][];
  winners?: string[];
  losers?: string[];
  isDraw?: boolean;
  status: string;
}

/**
 * "A def. B & C", or "A vs B (draw)". Null for a match with no result. A draw
 * stores every participant as a winner, so `isDraw` is checked first.
 */
export function describeMatchResult(match: ResultMatchInput, nameOf: (playerId: string) => string): string | null {
  if (match.status !== 'completed') return null;
  if (match.isDraw) {
    const sides = match.teams ?? match.participants.map((playerId) => [playerId]);
    if (sides.length === 0) return null;
    return `${sides.map((side) => side.map(nameOf).join(' & ')).join(' vs ')} (draw)`;
  }
  const winners = match.winners ?? [];
  const losers = match.losers ?? [];
  if (winners.length === 0 || losers.length === 0) return null;
  return `${winners.map(nameOf).join(' & ')} def. ${losers.map(nameOf).join(' & ')}`;
}

/** Drops empty segments and orders the rest by priority. */
export function assembleTickerSegments(segments: ReadonlyArray<TickerSegment | null>, now: Date): TickerResponse {
  const kept = segments
    .filter((built): built is TickerSegment => built !== null && built.items.length > 0)
    .sort((first, second) => first.priority - second.priority);
  return { segments: kept, generatedAt: now.toISOString() };
}
