import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Player, Championship } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { FORMER_MEMBER, isHiddenLivePlayer, realWrestlerName } from '../../lib/needsWrestler';
import { isChallengeLapsed } from '../../lib/challengeExpiry';
import { isPromoArchived } from '../../lib/promoArchive';

const ACTIVITY_TYPES = ['match', 'championship', 'challenge', 'promo', 'tournament', 'season'] as const;
type ActivityTypeFilter = (typeof ACTIVITY_TYPES)[number];

// Summaries are shown as written, so an id must never stand in for a name.
const UNKNOWN_CHAMPIONSHIP = 'Unknown Championship';

export type ActivityItemType =
  | 'match_result'
  | 'championship_change'
  | 'season_event'
  | 'tournament_result'
  | 'challenge_event'
  | 'promo_posted';

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

function loadIf<TItem>(enabled: boolean, load: () => Promise<TItem[]>): Promise<TItem[]> {
  return enabled ? load() : Promise.resolve([]);
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { limit, cursor, typeFilter } = parseQuery(event);
    const { competition: { matches, championships, tournaments }, season: { seasons }, user: { challenges }, content: { promos }, roster: { players } } = getRepositories();

    const includeMatch = !typeFilter || typeFilter === 'match';
    const includeChampionship = !typeFilter || typeFilter === 'championship';
    const includeSeason = !typeFilter || typeFilter === 'season';
    const includeTournament = !typeFilter || typeFilter === 'tournament';
    const includeChallenge = !typeFilter || typeFilter === 'challenge';
    const includePromo = !typeFilter || typeFilter === 'promo';

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
    ] = await Promise.all([
      loadIf(includeMatch, () => matches.listCompleted()),
      loadIf(includeChampionship, () => championships.listAllHistory()),
      loadIf(includeSeason, () => seasons.list()),
      loadIf(includeTournament, () => tournaments.list()),
      loadIf(includeChallenge, () => challenges.list()),
      loadIf(includePromo, () => promos.list()),
      players.listWithDeleted(),
      loadIf(includeChampionship, () => championships.list()),
    ]);

    for (const m of completedMatches) {
      if (!m.updatedAt) continue; // only show matches that have been recorded/updated with updatedAt
      const participants = m.participants || [];
      const winners = m.winners || [];
      const losers = m.losers || [];
      participants.forEach((p) => playerIds.add(p));
      rawItems.push({
        type: 'match_result',
        timestamp: m.updatedAt,
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
        item.summary = winnerNames.length && loserNames.length
          ? `${winnerNames.join(' & ')} def. ${loserNames.join(' & ')}`
          : 'Match completed';
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
      }
    }

    // Promos and challenges involving hidden players leave the feed. Matches,
    // title changes and tournament results are league history, so they stay,
    // and the name map above still covers everyone. A deleted player's items
    // stay as they did before the row was kept, now with the real name.
    const hiddenPlayerIds = new Set(allPlayers.filter(isHiddenLivePlayer).map((p) => p.playerId));
    const visibleItems = rawItems.filter((item) => {
      if (item.type === 'promo_posted') return !hiddenPlayerIds.has(item.metadata.playerId as string);
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
