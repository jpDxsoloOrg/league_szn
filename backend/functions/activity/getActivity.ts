import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Player, Championship, ProgressionEvent } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { FORMER_MEMBER, isHiddenLivePlayer, realWrestlerName } from '../../lib/needsWrestler';
import { isChallengeLapsed } from '../../lib/challengeExpiry';
import { isPromoArchived } from '../../lib/promoArchive';
import { isRelegationWatchPublic, listActiveConsiderations, type ActiveConsideration } from '../../lib/progression/considerations';
import { getVerifiedCaller, isStaff } from '../../lib/optionalCaller';

const ACTIVITY_TYPES = ['match', 'championship', 'challenge', 'promo', 'tournament', 'season', 'callup', 'promotion', 'relegation', 'division'] as const;
type ActivityTypeFilter = (typeof ACTIVITY_TYPES)[number];

// Summaries are shown as written, so an id must never stand in for a name.
const UNKNOWN_CHAMPIONSHIP = 'Unknown Championship';

export type ActivityItemType =
  | 'match_result'
  | 'championship_change'
  | 'season_event'
  | 'tournament_result'
  | 'challenge_event'
  | 'promo_posted'
  | 'callup_consideration'
  | 'callup_executed'
  | 'promotion_watch'
  | 'relegation_watch'
  | 'division_promotion'
  | 'division_relegation';

/** Current GM marks, one item per marked player. */
type WatchItemType = 'callup_consideration' | 'promotion_watch' | 'relegation_watch';

const WATCH_SUMMARIES: Record<WatchItemType, string> = {
  callup_consideration: 'is being considered for a call-up',
  promotion_watch: "is on the GMs' promotion watch",
  relegation_watch: "is on the GMs' relegation watch",
};

function isWatchItem(type: ActivityItemType): type is WatchItemType {
  return type in WATCH_SUMMARIES;
}

export interface ActivityItem {
  id: string;
  type: ActivityItemType;
  timestamp: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface ActivityFeedResponse {
  items: ActivityItem[];
  nextCursor: string | null;
}

function parseQuery(event: { queryStringParameters?: Record<string, string | undefined> | null }): {
  limit: number;
  cursor: string | null;
  typeFilter: ActivityTypeFilter | null;
} {
  const params = event.queryStringParameters || {};
  const limit = Math.min(Math.max(parseInt(params.limit || '20', 10) || 20, 1), 100);
  const cursor = params.cursor && params.cursor.trim() ? params.cursor.trim() : null;
  const typeParam = (params.type || '').toLowerCase();
  const typeFilter = ACTIVITY_TYPES.includes(typeParam as ActivityTypeFilter)
    ? (typeParam as ActivityTypeFilter)
    : null;
  return { limit, cursor, typeFilter };
}

function buildPlayerNameMap(allPlayers: Player[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const player of allPlayers) {
    names[player.playerId] = player.name || realWrestlerName(player.currentWrestler) || FORMER_MEMBER;
  }
  return names;
}

function buildChallengeSummary(status: unknown, challenger: unknown, challenged: unknown): string {
  switch (status) {
    case 'accepted':
      return `${challenged} accepted ${challenger}'s challenge`;
    case 'declined':
      return `${challenged} declined ${challenger}'s challenge`;
    case 'countered':
      return `${challenged} countered ${challenger}'s challenge`;
    case 'cancelled':
      return `${challenger} withdrew their challenge to ${challenged}`;
    default:
      return `${challenger} challenged ${challenged}`;
  }
}

function buildChampionshipNameMap(allChampionships: Championship[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const championship of allChampionships) {
    names[championship.championshipId] = championship.name || UNKNOWN_CHAMPIONSHIP;
  }
  return names;
}

/**
 * DMV-09: a promotion is always news. A relegation reaches the public feed
 * only when the GM opted in to announcing it.
 */
export function isPublicDivisionMove(event: Pick<ProgressionEvent, 'kind' | 'announced'>): boolean {
  if (event.kind === 'promotion') return true;
  if (event.kind === 'relegation') return event.announced === true;
  return false;
}

/** Relegation copy stays neutral: "X moves to NXT", never "X was relegated". */
export function buildDivisionMoveSummary(
  type: 'division_promotion' | 'division_relegation',
  playerName: string,
  toDivisionName: string | undefined,
): string {
  if (type === 'division_promotion') {
    return toDivisionName ? `${playerName} was promoted to ${toDivisionName}` : `${playerName} was promoted`;
  }
  return toDivisionName ? `${playerName} moves to ${toDivisionName}` : `${playerName} moves to a new division`;
}

function loadIf<TItem>(enabled: boolean, load: () => Promise<TItem[]>): Promise<TItem[]> {
  return enabled ? load() : Promise.resolve([]);
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { limit, cursor, typeFilter } = parseQuery(event);
    const { competition: { matches, championships, tournaments }, season: { seasons }, user: { challenges }, content: { promos }, roster: { players }, leagueOps: { divisions }, progression } = getRepositories();

    const includeMatch = !typeFilter || typeFilter === 'match';
    const includeChampionship = !typeFilter || typeFilter === 'championship';
    const includeSeason = !typeFilter || typeFilter === 'season';
    const includeTournament = !typeFilter || typeFilter === 'tournament';
    const includeChallenge = !typeFilter || typeFilter === 'challenge';
    const includePromo = !typeFilter || typeFilter === 'promo';
    const includeCallup = !typeFilter || typeFilter === 'callup';
    const includePromotion = !typeFilter || typeFilter === 'promotion';
    // Relegation marks are GM-only (DMV-04): Moderator+ see them, everyone
    // else only once the league turns on public relegation watch.
    const includeRelegation = (!typeFilter || typeFilter === 'relegation')
      && ((await isRelegationWatchPublic()) || isStaff(await getVerifiedCaller(event)));
    const includeDivision = !typeFilter || typeFilter === 'division';

    const rawItems: { type: ActivityItemType; timestamp: string; id: string; summary: string; metadata: Record<string, unknown> }[] = [];
    const playerIds = new Set<string>();

    // Every source is independent, so they load together. Players and
    // championships back the name maps used further down.
    const [
      completedMatches,
      history,
      allSeasons,
      allTournaments,
      allChallenges,
      allPromos,
      allPlayers,
      allChampionships,
      callupConsiderations,
      promotionConsiderations,
      relegationConsiderations,
      executedEvents,
      allDivisions,
    ] = await Promise.all([
      loadIf(includeMatch, () => matches.listCompleted()),
      loadIf(includeChampionship, () => championships.listAllHistory()),
      loadIf(includeSeason, () => seasons.list()),
      loadIf(includeTournament, () => tournaments.list()),
      loadIf(includeChallenge, () => challenges.list()),
      loadIf(includePromo, () => promos.list()),
      players.listWithDeleted(),
      loadIf(includeChampionship, () => championships.list()),
      // Current marks only: an unmark removes the item, and is never news.
      loadIf(includeCallup, () => listActiveConsiderations('callup')),
      loadIf(includePromotion, () => listActiveConsiderations('promotion')),
      loadIf(includeRelegation, () => listActiveConsiderations('relegation')),
      loadIf(includeCallup || includeDivision, () => progression.listEventsByType('executed')),
      loadIf(includeCallup || includeDivision, () => divisions.list()),
    ]);

    for (const m of completedMatches) {
      if (!m.updatedAt) continue; // only show matches that have been recorded/updated with updatedAt
      const participants = m.participants || [];
      const winners = m.winners || [];
      const losers = m.losers || [];
      participants.forEach((p) => playerIds.add(p));
      rawItems.push({
        type: 'match_result',
        // The match date, not updatedAt: ratings and edits bump updatedAt, which
        // would move an old result back to the top of the feed.
        timestamp: m.date,
        id: `match-${m.matchId}`,
        summary: '', // filled after we have names
        metadata: {
          matchId: m.matchId,
          date: m.date,
          matchFormat: m.matchFormat,
          stipulationId: m.stipulationId,
          participants,
          winners,
          losers,
          isChampionship: m.isChampionship,
          championshipId: m.championshipId,
          tournamentId: m.tournamentId,
          eventId: m.eventId,
        },
      });
    }

    for (const h of history) {
      if (!h.updatedAt) continue; // only show championship history with updatedAt
      const champion = h.champion;
      if (typeof champion === 'string') playerIds.add(champion);
      else if (Array.isArray(champion)) champion.forEach((c) => playerIds.add(c));
      rawItems.push({
        type: 'championship_change',
        timestamp: h.updatedAt,
        id: `championship-${h.championshipId}-${h.wonDate}`,
        summary: '',
        metadata: {
          championshipId: h.championshipId,
          wonDate: h.wonDate,
          champion,
          matchId: h.matchId,
          lostDate: h.lostDate,
          daysHeld: h.daysHeld,
        },
      });
    }

    for (const s of allSeasons) {
      if (!s.updatedAt) continue; // only show seasons with updatedAt
      rawItems.push({
        type: 'season_event',
        timestamp: s.updatedAt,
        id: `season-start-${s.seasonId}`,
        summary: '',
        metadata: {
          seasonId: s.seasonId,
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
          status: s.status,
          event: 'started',
        },
      });
      if (s.status === 'completed' && s.endDate) {
        rawItems.push({
          type: 'season_event',
          timestamp: s.updatedAt,
          id: `season-end-${s.seasonId}`,
          summary: '',
          metadata: {
            seasonId: s.seasonId,
            name: s.name,
            startDate: s.startDate,
            endDate: s.endDate,
            status: s.status,
            event: 'ended',
          },
        });
      }
    }

    for (const t of allTournaments) {
      const updatedAt = t.updatedAt || t.createdAt;
      if (!updatedAt) continue; // only show tournaments with updatedAt or createdAt
      if (t.winner) playerIds.add(t.winner);
      rawItems.push({
        type: 'tournament_result',
        timestamp: updatedAt,
        id: `tournament-${t.tournamentId}`,
        summary: '',
        metadata: {
          tournamentId: t.tournamentId,
          name: t.name,
          type: t.type,
          status: t.status,
          winner: t.winner,
          createdAt: t.createdAt,
        },
      });
    }

    const now = Date.now();
    for (const c of allChallenges) {
      // Nobody did anything when a challenge lapses, so it isn't news. A pending
      // one past its deadline counts too, as the hourly sweep may not have run.
      if (isChallengeLapsed(c, now)) continue;
      const updatedAt = c.updatedAt || c.createdAt;
      if (!updatedAt) continue; // only show challenges with updatedAt or createdAt
      playerIds.add(c.challengerId);
      playerIds.add(c.challengedId);
      rawItems.push({
        type: 'challenge_event',
        timestamp: updatedAt,
        id: `challenge-${c.challengeId}`,
        summary: '',
        metadata: {
          challengeId: c.challengeId,
          challengerId: c.challengerId,
          challengedId: c.challengedId,
          status: c.status,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        },
      });
    }

    for (const p of allPromos) {
      if (p.isHidden || isPromoArchived(p, now)) continue;
      const updatedAt = p.updatedAt || p.createdAt;
      if (!updatedAt) continue; // only show promos with updatedAt or createdAt
      playerIds.add(p.playerId);
      rawItems.push({
        type: 'promo_posted',
        timestamp: updatedAt,
        id: `promo-${p.promoId}`,
        summary: '',
        metadata: {
          promoId: p.promoId,
          playerId: p.playerId,
          promoType: p.promoType,
          title: p.title,
          createdAt: p.createdAt,
        },
      });
    }

    const watchSources: Array<[WatchItemType, string, ActiveConsideration[]]> = [
      ['callup_consideration', 'callup', callupConsiderations],
      ['promotion_watch', 'promotion-watch', promotionConsiderations],
      ['relegation_watch', 'relegation-watch', relegationConsiderations],
    ];
    for (const [type, idPrefix, considerations] of watchSources) {
      for (const c of considerations) {
        playerIds.add(c.playerId);
        rawItems.push({
          type,
          timestamp: c.consideration.markedAt,
          id: `${idPrefix}-${c.playerId}-${c.trackId}`,
          summary: '',
          metadata: { playerId: c.playerId, trackId: c.trackId },
        });
      }
    }

    for (const e of executedEvents) {
      const metadata = { playerId: e.playerId, trackId: e.trackId, fromDivisionId: e.fromDivisionId, toDivisionId: e.toDivisionId };
      if (e.kind === 'callup') {
        if (!includeCallup) continue;
        rawItems.push({ type: 'callup_executed', timestamp: e.createdAt, id: `callup-${e.eventId}`, summary: '', metadata });
      } else if (includeDivision && isPublicDivisionMove(e)) {
        rawItems.push({
          type: e.kind === 'promotion' ? 'division_promotion' : 'division_relegation',
          timestamp: e.createdAt,
          id: `division-${e.eventId}`,
          summary: '',
          metadata,
        });
      }
    }

    const playerNames = buildPlayerNameMap(allPlayers);
    const championshipNames = buildChampionshipNameMap(allChampionships);
    const nameOf = (playerId: unknown): string => playerNames[playerId as string] || FORMER_MEMBER;

    for (const item of rawItems) {
      if (item.type === 'match_result') {
        const meta = item.metadata;
        const winners = (meta.winners as string[]) || [];
        const losers = (meta.losers as string[]) || [];
        const winnerNames = winners.map(nameOf);
        const loserNames = losers.map(nameOf);
        meta.winnerNames = winnerNames;
        meta.loserNames = loserNames;
        // A draw stores every participant in winners, with no losers.
        if (winnerNames.length && loserNames.length) {
          item.summary = `${winnerNames.join(' & ')} def. ${loserNames.join(' & ')}`;
        } else {
          item.summary = winnerNames.length ? `${winnerNames.join(' & ')} drew` : 'Match completed';
        }
      } else if (item.type === 'championship_change') {
        const meta = item.metadata;
        const champ = meta.champion;
        const champNames = Array.isArray(champ) ? champ.map(nameOf) : [nameOf(champ)];
        meta.championNames = champNames;
        meta.championshipName = championshipNames[meta.championshipId as string] || UNKNOWN_CHAMPIONSHIP;
        item.summary = `${meta.championshipName}: ${champNames.join(' & ')} crowned`;
      } else if (item.type === 'season_event') {
        const meta = item.metadata;
        const name = meta.name as string;
        item.summary = meta.event === 'ended' ? `Season "${name}" ended` : `Season "${name}" started`;
      } else if (item.type === 'tournament_result') {
        const meta = item.metadata;
        const name = meta.name as string;
        const winner = meta.winner as string | undefined;
        meta.winnerName = winner ? nameOf(winner) : undefined;
        item.summary = winner
          ? `Tournament "${name}" completed — ${meta.winnerName} won`
          : `Tournament "${name}"`;
      } else if (item.type === 'challenge_event') {
        const meta = item.metadata;
        meta.challengerName = nameOf(meta.challengerId);
        meta.challengedName = nameOf(meta.challengedId);
        item.summary = buildChallengeSummary(meta.status, meta.challengerName, meta.challengedName);
      } else if (item.type === 'promo_posted') {
        const meta = item.metadata;
        meta.playerName = nameOf(meta.playerId);
        item.summary = `${meta.playerName} posted a promo`;
      } else if (isWatchItem(item.type)) {
        const meta = item.metadata;
        meta.playerName = nameOf(meta.playerId);
        item.summary = `${meta.playerName} ${WATCH_SUMMARIES[item.type]}`;
      } else if (item.type === 'division_promotion' || item.type === 'division_relegation') {
        const meta = item.metadata;
        meta.playerName = nameOf(meta.playerId);
        meta.fromDivisionName = allDivisions.find((d) => d.divisionId === meta.fromDivisionId)?.name;
        meta.toDivisionName = allDivisions.find((d) => d.divisionId === meta.toDivisionId)?.name;
        item.summary = buildDivisionMoveSummary(item.type, meta.playerName as string, meta.toDivisionName as string | undefined);
      } else if (item.type === 'callup_executed') {
        const meta = item.metadata;
        meta.playerName = nameOf(meta.playerId);
        meta.toDivisionName = allDivisions.find((d) => d.divisionId === meta.toDivisionId)?.name;
        item.summary = meta.toDivisionName
          ? `${meta.playerName} was called up to ${meta.toDivisionName}`
          : `${meta.playerName} was called up`;
      }
    }

    // Promos and challenges involving hidden players leave the feed. Matches,
    // title changes and tournament results are league history, so they stay,
    // and the name map above still covers everyone. A deleted player's items
    // stay as they did before the row was kept, now with the real name.
    const hiddenPlayerIds = new Set(allPlayers.filter(isHiddenLivePlayer).map((p) => p.playerId));
    // A GM mark (call-up, promotion or relegation watch) is about the player's future, so a deleted player's mark goes too.
    const livePlayerIds = new Set(allPlayers.filter((p) => !p.deletedAt).map((p) => p.playerId));
    const visibleItems = rawItems.filter((item) => {
      if (item.type === 'promo_posted' || item.type === 'callup_executed' || item.type === 'division_promotion'
        || item.type === 'division_relegation') return !hiddenPlayerIds.has(item.metadata.playerId as string);
      if (isWatchItem(item.type)) return livePlayerIds.has(item.metadata.playerId as string)
        && !hiddenPlayerIds.has(item.metadata.playerId as string);
      if (item.type === 'challenge_event') {
        return !hiddenPlayerIds.has(item.metadata.challengerId as string)
          && !hiddenPlayerIds.has(item.metadata.challengedId as string);
      }
      return true;
    });

    // Sort by timestamp desc, then id asc so same-timestamp items have deterministic order and cursor is stable
    visibleItems.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      if (tb !== ta) return tb - ta;
      return a.id.localeCompare(b.id);
    });

    let filtered = visibleItems;
    if (cursor) {
      let cursorTime: number;
      let cursorId: string | null = null;
      if (cursor.includes('|')) {
        const [ts, id] = cursor.split('|');
        if (ts && id) {
          cursorTime = new Date(ts).getTime();
          cursorId = id;
        } else {
          cursorTime = new Date(cursor).getTime();
        }
      } else {
        cursorTime = new Date(cursor).getTime();
      }
      filtered = visibleItems.filter((i) => {
        const t = new Date(i.timestamp).getTime();
        if (t < cursorTime) return true;
        if (t === cursorTime && cursorId !== null) return i.id > cursorId;
        return false;
      });
    }

    const items = filtered.slice(0, limit).map(({ id, type, timestamp, summary, metadata }) => ({
      id,
      type,
      timestamp,
      summary,
      metadata,
    }));

    const hasMore = filtered.length > limit;
    const nextCursor =
      hasMore && items.length > 0
        ? `${items[items.length - 1].timestamp}|${items[items.length - 1].id}`
        : null;

    return success({
      items,
      nextCursor,
    } as ActivityFeedResponse);
  } catch (err) {
    console.error('Error fetching activity:', err);
    return serverError('Failed to fetch activity');
  }
};
