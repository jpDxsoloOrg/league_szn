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
    winnerName: string;
    winnerImageUrl?: string;
    loserName: string;
    loserImageUrl?: string;
    championshipName?: string;
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
        // Fetch all data in parallel
        const [
            championships,
            players,
            events,
            seasons,
            matches,
            challenges,
        ] = await Promise.all([
            dynamoDb.scanAll({ TableName: TableNames.CHAMPIONSHIPS }),
            dynamoDb.scanAll({ TableName: TableNames.PLAYERS }),
            dynamoDb.scanAll({ TableName: TableNames.EVENTS }),
            dynamoDb.scanAll({ TableName: TableNames.SEASONS }),
            dynamoDb.scanAll({ TableName: TableNames.MATCHES }),
            dynamoDb.scanAll({ TableName: TableNames.CHALLENGES }),
        ]);

        // Build a player lookup map
        const playerMap = new Map<string, Record<string, unknown>>();
        for (const p of players) {
            playerMap.set(p.playerId as string, p);
        }

        // --- Current Champions ---
        const currentChampions: DashboardChampion[] = (championships as Record<string, unknown>[])
            .filter((c) => c.isActive !== false && c.currentChampion)
            .map((c) => {
                const player = playerMap.get(c.currentChampion as string);
                return {
                    championshipId: c.championshipId as string,
                    championshipName: c.name as string,
                    championName: player ? (player.name as string) : 'Unknown',
                    championImageUrl: player ? (player.imageUrl as string | undefined) : undefined,
                    playerId: c.currentChampion as string,
                    wonDate: c.wonDate as string | undefined,
                    defenses: c.defenses as number | undefined,
                };
            });

        // --- Upcoming Events ---
        const now = new Date().toISOString();
        const upcomingEvents: DashboardEvent[] = (events as Record<string, unknown>[])
            .filter((e) => e.status === 'upcoming' && (e.date as string) >= now)
            .sort((a, b) => (a.date as string).localeCompare(b.date as string))
            .slice(0, 3)
            .map((e) => ({
                eventId: e.eventId as string,
                name: e.name as string,
                date: e.date as string,
                eventType: e.eventType as string,
                venue: e.venue as string | undefined,
                matchCount: Array.isArray(e.matches) ? e.matches.length : undefined,
            }));

        // --- Recent Results ---
        const completedMatches = (matches as Record<string, unknown>[])
            .filter((m) => m.status === 'completed' && m.date)
            .sort((a, b) => (b.date as string).localeCompare(a.date as string))
            .slice(0, 5);

        const recentResults: DashboardMatch[] = completedMatches.map((m) => {
            const winners = (Array.isArray(m.winners) ? m.winners : [m.winnerId]) as string[];
            const participants = (m.participants as string[]) || [];
            const losers = participants.filter((p) => !winners.includes(p));

            const winnerPlayer = playerMap.get(winners[0]);
            const loserPlayer = playerMap.get(losers[0]);

            // Look up championship name if this was a title match
            let championshipName: string | undefined;
            if (m.championshipId) {
                const champ = championships.find(
                    (c) => (c as Record<string, unknown>).championshipId === m.championshipId
                );
                if (champ) {
                    championshipName = (champ as Record<string, unknown>).name as string;
                }
            }

            return {
                matchId: m.matchId as string,
                date: m.date as string,
                matchType: m.matchType as string,
                winnerName: winnerPlayer ? (winnerPlayer.name as string) : 'Unknown',
                winnerImageUrl: winnerPlayer ? (winnerPlayer.imageUrl as string | undefined) : undefined,
                loserName: loserPlayer ? (loserPlayer.name as string) : 'Unknown',
                loserImageUrl: loserPlayer ? (loserPlayer.imageUrl as string | undefined) : undefined,
                championshipName,
            };
        });

        // --- Season Info ---
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

        // --- Quick Stats ---
        const activeChampionships = (championships as Record<string, unknown>[]).filter(
            (c) => c.isActive !== false
        );

        const completedMatchCount = (matches as Record<string, unknown>[]).filter(
            (m) => m.status === 'completed'
        ).length;

        // Find player with most wins
        let mostWinsPlayer: { name: string; wins: number } | undefined;
        if (players.length > 0) {
            const sorted = [...(players as Record<string, unknown>[])].sort(
                (a, b) => ((b.wins as number) || 0) - ((a.wins as number) || 0)
            );
            if (sorted[0] && ((sorted[0].wins as number) || 0) > 0) {
                mostWinsPlayer = {
                    name: sorted[0].name as string,
                    wins: sorted[0].wins as number,
                };
            }
        }

        const quickStats: DashboardQuickStats = {
            totalPlayers: players.length,
            totalMatches: completedMatchCount,
            activeChampionships: activeChampionships.length,
            mostWinsPlayer,
        };

        // --- Active Challenges Count ---
        const activeChallengesCount = (challenges as Record<string, unknown>[]).filter(
            (c) => c.status === 'pending'
        ).length;

        const response: DashboardResponse = {
            currentChampions,
            upcomingEvents,
            recentResults,
            seasonInfo,
            quickStats,
            activeChallengesCount,
        };

        return success(response);
    } catch (err) {
        console.error('Dashboard error:', err);
        return serverError('Failed to load dashboard data');
    }
};
