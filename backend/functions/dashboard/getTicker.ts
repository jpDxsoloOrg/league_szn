import type { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { DEFAULT_FEATURES, DEFAULT_TICKER_SETTINGS } from '../../lib/repositories';
import type { Championship, ChampionshipHistoryEntry, LeagueEvent, Player, TickerMessage } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { FORMER_MEMBER, isNeedsWrestler, isPlayerVisible } from '../../lib/needsWrestler';
import { listActiveConsiderations } from '../../lib/progression/considerations';
import {
  assembleTickerSegments,
  buildChampionsSegment,
  buildCustomSegments,
  buildHotRivalriesSegment,
  buildLatestResultsSegment,
  buildNewChampionsSegment,
  buildNewsSegment,
  buildPotentialCallupsSegment,
  buildTonightSegment,
  buildUpcomingShowsSegment,
  describeMatchResult,
  type ConsideredPlayer,
  type CustomTickerMessageInput,
  type LatestShowInput,
  type ResultLineInput,
  type TickerResponse,
  type TickerSegment,
} from '../../lib/ticker/segments';

/**
 * Browsers and shared caches may reuse a ticker answer for this long, so a
 * new call-up flag shows up within a minute.
 */
export const TICKER_CACHE_SECONDS = 60;

/** Enough active rivalries to find the hot ones without paging. */
const RIVALRY_PAGE_LIMIT = 100;

/** GM ticker messages that are live now, pinned first. */
export async function loadCustomTickerMessages(now: Date): Promise<CustomTickerMessageInput[]> {
  const { content: { tickerMessages } } = getRepositories();
  const live = await tickerMessages.listActive(now);
  return live.map((message: TickerMessage) => (message.href
    ? { text: message.text, href: message.href, pinned: message.pinned }
    : { text: message.text, pinned: message.pinned }));
}

function cachedResponse(body: TickerResponse) {
  const response = success(body);
  return {
    ...response,
    headers: { ...response.headers, 'Cache-Control': `public, max-age=${TICKER_CACHE_SECONDS}` },
  };
}

/** A player without a real wrestler name is shown by their own name. */
function displayName(player: Player | undefined): string {
  if (!player) return FORMER_MEMBER;
  return isNeedsWrestler(player.currentWrestler) ? player.name : player.currentWrestler;
}

function championIds(champion: string | string[] | undefined): string[] {
  if (!champion) return [];
  return Array.isArray(champion) ? champion : [champion];
}

/** Logs a failed source and falls back, so one bad table cannot blank the ticker. */
function settled<T>(result: PromiseSettledResult<T>, label: string, fallback: T): T {
  if (result.status === 'fulfilled') return result.value;
  console.error(`Ticker: ${label} failed:`, result.reason);
  return fallback;
}

/** The newest finished show with its results in card order, or null. */
async function loadLatestShow(completed: LeagueEvent[], nameOf: (playerId: string) => string): Promise<LatestShowInput | null> {
  const latest = [...completed].sort((first, second) => second.date.localeCompare(first.date))[0];
  if (!latest) return null;
  const { competition: { matches } } = getRepositories();
  const card = latest.matchCards ?? [];
  const found = await Promise.all(card.map((entry) => matches.findById(entry.matchId)));
  const results: ResultLineInput[] = [];
  card.forEach((entry, index) => {
    const match = found[index];
    const text = match ? describeMatchResult(match, nameOf) : null;
    if (text) results.push({ position: entry.position, text });
  });
  return { eventId: latest.eventId, name: latest.name, results };
}

/**
 * GET /ticker (public)
 *
 * The league ticker as ordered segments built from existing data. Empty
 * segments, and segments the admin turned off in the ticker settings, are
 * left out. With the `ticker` feature off it answers with no segments. See
 * `lib/ticker/segments.ts` for the shape.
 */
export const handler: APIGatewayProxyHandler = async () => {
  try {
    const now = new Date();
    const {
      competition: { championships },
      roster: { players },
      leagueOps: { events },
      content: { announcements },
      rivalries,
      user: { siteConfig },
    } = getRepositories();

    // Unreadable settings fall back to the defaults, which show everything.
    const [featureResult, settingsResult] = await Promise.allSettled([
      siteConfig.getFeatures(),
      siteConfig.getTickerSettings(),
    ]);
    if (!settled(featureResult, 'site features', DEFAULT_FEATURES).ticker) {
      return cachedResponse(assembleTickerSegments([], now));
    }
    const enabledSegments = new Set(settled(settingsResult, 'ticker settings', DEFAULT_TICKER_SETTINGS).enabledSegments);

    const [
      playerResult, championshipResult, historyResult, upcomingResult, liveResult,
      completedResult, rivalryResult, newsResult, callupResult, customResult,
    ] = await Promise.allSettled([
      players.listWithDeleted(),
      championships.list(),
      championships.listAllHistory(),
      events.listByStatus('upcoming'),
      events.listByStatus('in-progress'),
      events.listByStatus('completed'),
      rivalries.listByStatus('active', { limit: RIVALRY_PAGE_LIMIT }),
      announcements.listActive(),
      listActiveConsiderations('callup'),
      loadCustomTickerMessages(now),
    ]);

    const playerById = new Map<string, Player>();
    for (const player of settled(playerResult, 'players', [])) playerById.set(player.playerId, player);
    const nameOf = (playerId: string): string => displayName(playerById.get(playerId));
    const isPublic = (playerId: string): boolean => {
      const player = playerById.get(playerId);
      return Boolean(player && !player.deletedAt && isPlayerVisible(player));
    };

    const championshipList = settled<Championship[]>(championshipResult, 'championships', [])
      .filter((championship) => championship.isActive !== false);
    const championshipNames = new Map(championshipList.map((championship) => [championship.championshipId, championship.name]));

    const newChampionChanges = settled<ChampionshipHistoryEntry[]>(historyResult, 'championship history', [])
      .filter((entry) => championshipNames.has(entry.championshipId) && championIds(entry.champion).length > 0)
      .map((entry) => ({
        championshipId: entry.championshipId,
        championshipName: championshipNames.get(entry.championshipId) ?? '',
        championName: championIds(entry.champion).map(nameOf).join(' & '),
        wonDate: entry.wonDate,
      }));

    // A hidden champion still holds the title, so they stay listed by their own name.
    const currentChampions = championshipList
      .filter((championship) => championIds(championship.currentChampion).length > 0)
      .map((championship) => ({
        championshipName: championship.name,
        championName: championIds(championship.currentChampion).map(nameOf).join(' & '),
      }));

    const scheduled = [
      ...settled(liveResult, 'in-progress events', []),
      ...settled(upcomingResult, 'upcoming events', []),
    ];

    const callups: ConsideredPlayer[] = settled(callupResult, 'call-up considerations', [])
      .filter((consideration) => isPublic(consideration.playerId))
      .map((consideration) => ({ playerId: consideration.playerId, displayName: nameOf(consideration.playerId) }));

    // Ongoing storylines with a hidden participant stay off public lists.
    const hotRivalries = settled(rivalryResult, 'rivalries', { items: [] }).items
      .filter((rivalry) => rivalry.participants.every((participant) => isPublic(participant.playerId)));

    let latestShow: LatestShowInput | null = null;
    try {
      latestShow = await loadLatestShow(settled(completedResult, 'completed events', []), nameOf);
    } catch (err) {
      console.error('Ticker: latest show results failed:', err);
    }

    const built: Array<TickerSegment | null> = [
      ...buildCustomSegments(settled(customResult, 'custom messages', [])),
      buildTonightSegment(scheduled, now),
      buildNewChampionsSegment(newChampionChanges, now),
      buildPotentialCallupsSegment(callups),
      // promotionWatch: buildPromotionWatchSegment is ready; DMV-04 adds the promotion kind it reads.
      buildHotRivalriesSegment(hotRivalries),
      buildNewsSegment(settled(newsResult, 'announcements', [])),
      buildUpcomingShowsSegment(scheduled, now),
      buildChampionsSegment(currentChampions),
      buildLatestResultsSegment(latestShow),
    ];
    const enabled = built.filter((segment) => segment !== null && enabledSegments.has(segment.key));

    return cachedResponse(assembleTickerSegments(enabled, now));
  } catch (err) {
    console.error('Ticker error:', err);
    return serverError('Failed to load ticker');
  }
};
