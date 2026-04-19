import type { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Player, Championship, ChampionshipHistoryEntry } from '../../lib/repositories';
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
  starRating?: number;
  matchOfTheNight?: boolean;
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
  inProgressEvents: DashboardEvent[];
  recentResults: DashboardMatch[];
  seasonInfo: DashboardSeason | null;
  quickStats: DashboardQuickStats;
  activeChallengesCount: number;
}

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { competition: { championships, matches, stipulations }, roster: { players }, season: { seasons, seasonStandings }, leagueOps: { events }, user: { challenges } } = getRepositories();

    // Fetch data: championships, players, seasons, matches, stipulations; events and challenges via query
    const [championshipList, playerList, seasonList, matchList, stipulationList, upcomingEventsList, inProgressEventsList, pendingChallengeList] =
      await Promise.all([
        championships.list(),
        players.list(),
        seasons.list(),
        matches.list(),
        stipulations.list(),
        events.listByStatus('upcoming'),
        events.listByStatus('in-progress'),
        challenges.listByStatus('pending'),
      ]);

    // Only include players who have a wrestler assigned (exclude Fantasy-only users)
    const wrestlerPlayers = playerList.filter((p) => p.currentWrestler);

    const playerMap = new Map<string, Player>();
    for (const p of wrestlerPlayers) {
      if (p.playerId) playerMap.set(p.playerId, p);
    }

    const championshipMap = new Map<string, Championship>();
    for (const c of championshipList) {
      if (c.championshipId) championshipMap.set(c.championshipId, c);
    }

    const stipulationMap = new Map<string, string>();
    for (const s of stipulationList ?? []) {
      if (s.stipulationId && s.name) stipulationMap.set(s.stipulationId, s.name);
    }

    // Current champions: active championships with currentChampion.
    // wonDate is read from the open reign in ChampionshipHistory (the row
    // where lostDate is absent), NOT from Championships.updatedAt — that
    // field bumps on any championship edit (e.g. image upload) and is not
    // a reliable source of reign length.
    interface ChampionCandidate {
      championship: Championship;
      playerIds: string[];
      names: string[];
      imageUrl?: string;
    }
    const championCandidates: ChampionCandidate[] = [];
    for (const c of championshipList) {
      if (c.isActive === false) continue;
      const champ = c.currentChampion;
      if (!champ) continue;
      const playerIds = Array.isArray(champ) ? champ : [champ];
      const names: string[] = [];
      let imageUrl: string | undefined;
      for (const pid of playerIds) {
        const player = playerMap.get(pid);
        if (player) {
          names.push(player.currentWrestler || player.name);
          if (player.imageUrl) imageUrl = player.imageUrl;
        }
      }
      if (names.length > 0) {
        championCandidates.push({ championship: c, playerIds, names, imageUrl });
      }
    }

    const currentReigns: (ChampionshipHistoryEntry | null)[] = await Promise.all(
      championCandidates.map((cand) =>
        championships.findCurrentReign(cand.championship.championshipId)
      )
    );

    const currentChampions: DashboardChampion[] = championCandidates.map(
      (cand, i) => {
        const reign = currentReigns[i];
        return {
          championshipId: cand.championship.championshipId,
          championshipName: cand.championship.name,
          championName: cand.names.join(' & '),
          championImageUrl: cand.imageUrl,
          playerId: cand.playerIds[0] ?? '',
          wonDate: reign?.wonDate ?? undefined,
          defenses: reign?.defenses ?? cand.championship.defenses,
        };
      }
    );

    // Upcoming events (slice to 3 client-side)
    const upcomingEvents: DashboardEvent[] = upcomingEventsList
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      .slice(0, 3)
      .map((e) => ({
        eventId: e.eventId,
        name: e.name ?? 'Event',
        date: e.date,
        eventType: e.eventType ?? 'event',
        venue: e.venue,
        matchCount: e.matchCards?.length,
      }));

    // In-progress events
    const inProgressEvents: DashboardEvent[] = inProgressEventsList
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      .map((e) => ({
        eventId: e.eventId,
        name: e.name ?? 'Event',
        date: e.date,
        eventType: e.eventType ?? 'event',
        venue: e.venue,
        matchCount: e.matchCards?.length,
      }));

    // Recent results: only matches with updatedAt (recorded after we added it), sort by updatedAt desc, limit 20 for date grouping
    const completedMatches = matchList.filter(
      (m) =>
        m.status === 'completed' &&
        m.winners &&
        m.losers &&
        m.updatedAt
    );
    completedMatches.sort(
      (a, b) =>
        new Date(b.updatedAt!).getTime() -
        new Date(a.updatedAt!).getTime()
    );
    // Limit recent results to matches updated within the last 3 days
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const recentCompletedMatches = completedMatches.filter(
      (m) => (m.updatedAt || m.date) >= threeDaysAgo
    );
    // Safety cap to avoid unbounded responses
    const recentResults: DashboardMatch[] = recentCompletedMatches.slice(0, 50).map((m) => {
      const winnerIds = m.winners!;
      const loserIds = m.losers!;
      const winnerName = (winnerIds || [])
        .map((id) => {
          const p = playerMap.get(id);
          return p ? p.currentWrestler || p.name : '';
        })
        .filter(Boolean)
        .join(' & ');
      // Use " vs " for losers so triple threat / fatal four way read as "A vs B vs C" not "A vs B & C"
      const loserName = (loserIds || [])
        .map((id) => {
          const p = playerMap.get(id);
          return p ? p.currentWrestler || p.name : '';
        })
        .filter(Boolean)
        .join(' vs ');
      const firstWinner = winnerIds?.[0];
      const firstLoser = loserIds?.[0];
      const champId = m.championshipId;
      const champ = champId ? championshipMap.get(champId) : undefined;
      const stipulationId = m.stipulationId;
      const stipulationName = stipulationId ? stipulationMap.get(stipulationId) : undefined;
      const matchType = m.matchFormat ?? m.matchType ?? 'singles';
      const isChampionship = Boolean(m.isChampionship && champId);
      return {
        matchId: m.matchId,
        date: m.date,
        matchType,
        stipulation: stipulationName,
        isChampionship,
        championshipName: champ ? champ.name : undefined,
        championshipImageUrl: champ?.imageUrl,
        starRating: m.starRating,
        matchOfTheNight: Boolean(m.matchOfTheNight),
        winnerName: winnerName || '\u2014',
        winnerImageUrl: firstWinner
          ? playerMap.get(firstWinner)?.imageUrl
          : undefined,
        loserName: loserName || '\u2014',
        loserImageUrl: firstLoser
          ? playerMap.get(firstLoser)?.imageUrl
          : undefined,
        eventId: m.eventId,
      };
    });

    // Active season
    const activeSeason = seasonList.find(
      (s) => s.status === 'active'
    );
    let seasonInfo: DashboardSeason | null = null;
    if (activeSeason) {
      const seasonMatches = matchList.filter(
        (m) => m.seasonId === activeSeason.seasonId && m.status === 'completed'
      );
      seasonInfo = {
        seasonId: activeSeason.seasonId,
        name: activeSeason.name,
        startDate: activeSeason.startDate,
        endDate: activeSeason.endDate,
        status: activeSeason.status,
        matchesPlayed: seasonMatches.length,
      };
    }

    // Quick stats
    const totalMatches = matchList.filter(
      (m) => m.status === 'completed'
    ).length;
    let mostWinsPlayer: { name: string; wins: number } | undefined;
    if (activeSeason) {
      const standings = await seasonStandings.listBySeason(activeSeason.seasonId);
      let maxWins = 0;
      for (const s of standings) {
        const w = s.wins ?? 0;
        if (w > maxWins) {
          maxWins = w;
          const p = playerMap.get(s.playerId);
          mostWinsPlayer = {
            name: p?.currentWrestler || p?.name || '\u2014',
            wins: w,
          };
        }
      }
    } else {
      let maxWins = 0;
      for (const p of wrestlerPlayers) {
        const w = p.wins ?? 0;
        if (w > maxWins) {
          maxWins = w;
          mostWinsPlayer = {
            name: p.currentWrestler || p.name || '\u2014',
            wins: w,
          };
        }
      }
    }

    const quickStats: DashboardQuickStats = {
      totalPlayers: wrestlerPlayers.length,
      totalMatches,
      activeChampionships: championshipList.filter(
        (c) => c.isActive !== false
      ).length,
      mostWinsPlayer,
    };

    const response: DashboardResponse = {
      currentChampions,
      upcomingEvents,
      inProgressEvents,
      recentResults,
      seasonInfo,
      quickStats,
      activeChallengesCount: pendingChallengeList.length,
    };

    return success(response);
  } catch (err) {
    console.error('Dashboard error:', err);
    return serverError('Failed to load dashboard data');
  }
};
