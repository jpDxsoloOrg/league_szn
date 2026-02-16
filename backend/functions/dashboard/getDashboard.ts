import type { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

interface DashboardChampion {
  championshipId: string;
  championshipName: string;
  championName: string;
  championImageUrl?: string;
  playerId: string;
  wonDate?: string;
  defenses?: number;
}

interface DashboardEvent {
  eventId: string;
  name: string;
  date: string;
  eventType: string;
  venue?: string;
  matchCount?: number;
}

interface DashboardMatch {
  matchId: string;
  date: string;
  matchType: string;
  stipulation?: string;
  isChampionship?: boolean;
  championshipName?: string;
  championshipImageUrl?: string;
  winnerName: string;
  winnerImageUrl?: string;
  loserName: string;
  loserImageUrl?: string;
  eventId?: string;
}

interface DashboardSeason {
  seasonId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  status: string;
  matchesPlayed?: number;
}

interface DashboardQuickStats {
  totalPlayers: number;
  totalMatches: number;
  activeChampionships: number;
  mostWinsPlayer?: { name: string; wins: number };
}

interface DashboardResponse {
  currentChampions: DashboardChampion[];
  upcomingEvents: DashboardEvent[];
  recentResults: DashboardMatch[];
  seasonInfo: DashboardSeason | null;
  quickStats: DashboardQuickStats;
  activeChallengesCount: number;
}

export const handler: APIGatewayProxyHandler = async () => {
  try {
    // Fetch data: championships, players, seasons, matches, stipulations; events and challenges via query
    const [championships, players, seasons, matches, stipulations, upcomingEventsResult, pendingChallenges] =
      await Promise.all([
        dynamoDb.scanAll({ TableName: TableNames.CHAMPIONSHIPS }),
        dynamoDb.scanAll({ TableName: TableNames.PLAYERS }),
        dynamoDb.scanAll({ TableName: TableNames.SEASONS }),
        dynamoDb.scanAll({ TableName: TableNames.MATCHES }),
        dynamoDb.scanAll({ TableName: TableNames.STIPULATIONS }),
        dynamoDb.query({
          TableName: TableNames.EVENTS,
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#s = :status',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':status': 'upcoming' },
          ScanIndexForward: true,
          Limit: 3,
        }),
        dynamoDb.queryAll({
          TableName: TableNames.CHALLENGES,
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#s = :status',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':status': 'pending' },
        }),
      ]);

    const playerMap = new Map<string, Record<string, unknown>>();
    for (const p of players as Record<string, unknown>[]) {
      const id = p.playerId as string;
      if (id) playerMap.set(id, p);
    }

    const championshipMap = new Map<string, Record<string, unknown>>();
    for (const c of championships as Record<string, unknown>[]) {
      const id = c.championshipId as string;
      if (id) championshipMap.set(id, c);
    }

    const stipulationMap = new Map<string, string>();
    for (const s of (stipulations as Record<string, unknown>[]) ?? []) {
      const id = s.stipulationId as string;
      if (id && s.name) stipulationMap.set(id, s.name as string);
    }

    // Current champions: active championships with currentChampion
    const currentChampions: DashboardChampion[] = [];
    for (const c of championships as Record<string, unknown>[]) {
      if (c.isActive === false) continue;
      const champ = c.currentChampion;
      if (!champ) continue;
      const playerIds = Array.isArray(champ) ? champ : [champ];
      const names: string[] = [];
      let imageUrl: string | undefined;
      for (const pid of playerIds) {
        const player = playerMap.get(pid as string);
        if (player) {
          names.push((player.currentWrestler as string) || (player.name as string));
          if (player.imageUrl) imageUrl = player.imageUrl as string;
        }
      }
      if (names.length > 0) {
        currentChampions.push({
          championshipId: c.championshipId as string,
          championshipName: c.name as string,
          championName: names.join(' & '),
          championImageUrl: imageUrl,
          playerId: (playerIds[0] as string) ?? '',
          wonDate: c.updatedAt as string,
          defenses: c.defenses as number | undefined,
        });
      }
    }

    // Upcoming events (already limited to 3 by query)
    const upcomingEvents: DashboardEvent[] = ((upcomingEventsResult.Items || []) as Record<
      string,
      unknown
   >[])
      .sort(
        (a, b) =>
          new Date(a.date as string).getTime() - new Date(b.date as string).getTime()
      )
      .slice(0, 3)
      .map((e) => ({
        eventId: e.eventId as string,
        name: (e.name as string) ?? 'Event',
        date: e.date as string,
        eventType: (e.eventType as string) ?? 'event',
        venue: e.venue as string | undefined,
        matchCount: e.matchCount as number | undefined,
      }));

    // Recent results: completed matches, sort by when completed (updatedAt) then date desc, limit 5
    const completedMatches = (matches as Record<string, unknown>[]).filter(
      (m) => m.status === 'completed' && m.winners && m.losers
    );
    completedMatches.sort((a, b) => {
      const aTime = (a.updatedAt as string) ? new Date(a.updatedAt as string).getTime() : new Date(a.date as string).getTime();
      const bTime = (b.updatedAt as string) ? new Date(b.updatedAt as string).getTime() : new Date(b.date as string).getTime();
      return bTime - aTime;
    });
    const recentResults: DashboardMatch[] = completedMatches.slice(0, 5).map((m) => {
      const winnerIds = m.winners as string[];
      const loserIds = m.losers as string[];
      const winnerName = (winnerIds || [])
        .map((id) => {
          const p = playerMap.get(id);
          return p ? (p.currentWrestler as string) || (p.name as string) : '';
        })
        .filter(Boolean)
        .join(' & ');
      // Use " vs " for losers so triple threat / fatal four way read as "A vs B vs C" not "A vs B & C"
      const loserName = (loserIds || [])
        .map((id) => {
          const p = playerMap.get(id);
          return p ? (p.currentWrestler as string) || (p.name as string) : '';
        })
        .filter(Boolean)
        .join(' vs ');
      const firstWinner = winnerIds?.[0];
      const firstLoser = loserIds?.[0];
      const champId = m.championshipId as string | undefined;
      const champ = champId ? championshipMap.get(champId) : undefined;
      const stipulationId = m.stipulationId as string | undefined;
      const stipulationName = stipulationId ? stipulationMap.get(stipulationId) : undefined;
      const matchType = (m.matchFormat as string) ?? (m.matchType as string) ?? 'singles';
      const isChampionship = Boolean(m.isChampionship && champId);
      return {
        matchId: m.matchId as string,
        date: m.date as string,
        matchType,
        stipulation: stipulationName,
        isChampionship,
        championshipName: champ ? (champ.name as string) : undefined,
        championshipImageUrl: champ?.imageUrl as string | undefined,
        winnerName: winnerName || '—',
        winnerImageUrl: firstWinner
          ? (playerMap.get(firstWinner)?.imageUrl as string | undefined)
          : undefined,
        loserName: loserName || '—',
        loserImageUrl: firstLoser
          ? (playerMap.get(firstLoser)?.imageUrl as string | undefined)
          : undefined,
        eventId: m.eventId as string | undefined,
      };
    });

    // Active season
    const activeSeason = (seasons as Record<string, unknown>[]).find(
      (s) => s.status === 'active'
    );
    let seasonInfo: DashboardSeason | null = null;
    if (activeSeason) {
      const seasonMatches = (matches as Record<string, unknown>[]).filter(
        (m) => m.seasonId === activeSeason.seasonId && m.status === 'completed'
      );
      seasonInfo = {
        seasonId: activeSeason.seasonId as string,
        name: activeSeason.name as string,
        startDate: activeSeason.startDate as string | undefined,
        endDate: activeSeason.endDate as string | undefined,
        status: activeSeason.status as string,
        matchesPlayed: seasonMatches.length,
      };
    }

    // Quick stats
    const totalMatches = (matches as Record<string, unknown>[]).filter(
      (m) => m.status === 'completed'
    ).length;
    let mostWinsPlayer: { name: string; wins: number } | undefined;
    if (activeSeason) {
      const seasonStandings = await dynamoDb.queryAll({
        TableName: TableNames.SEASON_STANDINGS,
        KeyConditionExpression: 'seasonId = :sid',
        ExpressionAttributeValues: { ':sid': activeSeason.seasonId },
      });
      let maxWins = 0;
      for (const s of seasonStandings as Record<string, unknown>[]) {
        const w = (s.wins as number) ?? 0;
        if (w > maxWins) {
          maxWins = w;
          const p = playerMap.get(s.playerId as string);
          mostWinsPlayer = {
            name: (p?.currentWrestler as string) || (p?.name as string) || '—',
            wins: w,
          };
        }
      }
    } else {
      let maxWins = 0;
      for (const p of players as Record<string, unknown>[]) {
        const w = (p.wins as number) ?? 0;
        if (w > maxWins) {
          maxWins = w;
          mostWinsPlayer = {
            name: (p.currentWrestler as string) || (p.name as string) || '—',
            wins: w,
          };
        }
      }
    }

    const quickStats: DashboardQuickStats = {
      totalPlayers: players.length,
      totalMatches,
      activeChampionships: (championships as Record<string, unknown>[]).filter(
        (c) => c.isActive !== false
      ).length,
      mostWinsPlayer,
    };

    const response: DashboardResponse = {
      currentChampions,
      upcomingEvents,
      recentResults,
      seasonInfo,
      quickStats,
      activeChallengesCount: pendingChallenges.length,
    };

    return success(response);
  } catch (err) {
    console.error('Dashboard error:', err);
    return serverError('Failed to load dashboard data');
  }
};
