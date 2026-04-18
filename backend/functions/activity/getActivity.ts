import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type {
  Match,
  ChampionshipHistoryEntry,
  Season,
  Tournament,
  Challenge,
  Promo,
  Player,
  Championship,
} from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

const ACTIVITY_TYPES = ['match', 'championship', 'challenge', 'promo', 'tournament', 'season'] as const;
type ActivityTypeFilter = (typeof ACTIVITY_TYPES)[number];

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
    names[player.playerId] = player.name || player.currentWrestler || player.playerId;
  }
  return names;
}

function buildChampionshipNameMap(allChampionships: Championship[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const championship of allChampionships) {
    names[championship.championshipId] = championship.name || championship.championshipId;
  }
  return names;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { limit, cursor, typeFilter } = parseQuery(event);
    const { matches, championships, seasons, tournaments, challenges, promos, players } = getRepositories();

    const includeMatch = !typeFilter || typeFilter === 'match';
    const includeChampionship = !typeFilter || typeFilter === 'championship';
    const includeSeason = !typeFilter || typeFilter === 'season';
    const includeTournament = !typeFilter || typeFilter === 'tournament';
    const includeChallenge = !typeFilter || typeFilter === 'challenge';
    const includePromo = !typeFilter || typeFilter === 'promo';

    const rawItems: { type: ActivityItemType; timestamp: string; id: string; summary: string; metadata: Record<string, unknown> }[] = [];
    const playerIds = new Set<string>();
    const championshipIds = new Set<string>();

    if (includeMatch) {
      const completedMatches: Match[] = await matches.listCompleted();
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
    }

    if (includeChampionship) {
      const history: ChampionshipHistoryEntry[] = await championships.listAllHistory();
      for (const h of history) {
        if (!h.updatedAt) continue; // only show championship history with updatedAt
        championshipIds.add(h.championshipId);
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
    }

    if (includeSeason) {
      const allSeasons: Season[] = await seasons.list();
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
    }

    if (includeTournament) {
      const allTournaments: Tournament[] = await tournaments.list();
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
    }

    if (includeChallenge) {
      const allChallenges: Challenge[] = await challenges.list();
      for (const c of allChallenges) {
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
    }

    if (includePromo) {
      const allPromos: Promo[] = await promos.list();
      for (const p of allPromos) {
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
    }

    // Batch-fetch all players and championships to build name maps (eliminates N+1 lookups)
    const [allPlayers, allChampionships] = await Promise.all([
      players.list(),
      championshipIds.size > 0 ? championships.list() : Promise.resolve([]),
    ]);

    const playerNames = buildPlayerNameMap(allPlayers);
    const championshipNames = buildChampionshipNameMap(allChampionships);

    for (const item of rawItems) {
      if (item.type === 'match_result') {
        const meta = item.metadata;
        const winners = (meta.winners as string[]) || [];
        const losers = (meta.losers as string[]) || [];
        const winnerNames = winners.map((id) => playerNames[id] || id);
        const loserNames = losers.map((id) => playerNames[id] || id);
        meta.winnerNames = winnerNames;
        meta.loserNames = loserNames;
        item.summary = winnerNames.length && loserNames.length
          ? `${winnerNames.join(' & ')} def. ${loserNames.join(' & ')}`
          : 'Match completed';
      } else if (item.type === 'championship_change') {
        const meta = item.metadata;
        const champ = meta.champion;
        const champNames = Array.isArray(champ)
          ? (champ as string[]).map((id) => playerNames[id] || id)
          : [playerNames[champ as string] || (champ as string)];
        meta.championNames = champNames;
        meta.championshipName = championshipNames[meta.championshipId as string] || meta.championshipId;
        item.summary = `${meta.championshipName}: ${champNames.join(' & ')} crowned`;
      } else if (item.type === 'season_event') {
        const meta = item.metadata;
        const name = meta.name as string;
        item.summary = meta.event === 'ended' ? `Season "${name}" ended` : `Season "${name}" started`;
      } else if (item.type === 'tournament_result') {
        const meta = item.metadata;
        const name = meta.name as string;
        const winner = meta.winner as string | undefined;
        meta.winnerName = winner ? playerNames[winner] || winner : undefined;
        item.summary = winner
          ? `Tournament "${name}" completed — ${meta.winnerName || winner} won`
          : `Tournament "${name}"`;
      } else if (item.type === 'challenge_event') {
        const meta = item.metadata;
        meta.challengerName = playerNames[meta.challengerId as string] || meta.challengerId;
        meta.challengedName = playerNames[meta.challengedId as string] || meta.challengedId;
        item.summary = `${meta.challengerName} challenged ${meta.challengedName}`;
      } else if (item.type === 'promo_posted') {
        const meta = item.metadata;
        meta.playerName = playerNames[meta.playerId as string] || meta.playerId;
        item.summary = `${meta.playerName} posted a promo`;
      }
    }

    // Sort by timestamp desc, then id asc so same-timestamp items have deterministic order and cursor is stable
    rawItems.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      if (tb !== ta) return tb - ta;
      return a.id.localeCompare(b.id);
    });

    let filtered = rawItems;
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
      filtered = rawItems.filter((i) => {
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
