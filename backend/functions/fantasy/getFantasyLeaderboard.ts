import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

interface LeaderboardEntry {
  rank: number;
  fantasyUserId: string;
  username: string;
  totalPoints: number;
  currentSeasonPoints: number;
  perfectPicks: number;
  currentStreak: number;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.queryStringParameters?.seasonId;

    const { user: { fantasy }, leagueOps: { events } } = getRepositories();

    // Scan all fantasy picks
    const allPicks = await fantasy.listAllPicks();

    // If filtering by season, get events for that season to filter picks
    const allEvents = await events.list();
    let seasonEventIds: Set<string> | null = null;
    if (seasonId) {
      seasonEventIds = new Set(
        allEvents
          .filter((e) => e.seasonId === seasonId)
          .map((e) => e.eventId),
      );
    }

    // Get completed events to determine which picks have been scored
    const completedEvents = allEvents.filter((e) => e.status === 'completed');
    const completedEventIds = new Set(completedEvents.map((e) => e.eventId));

    // Aggregate points per user
    const userStats = new Map<
      string,
      {
        fantasyUserId: string;
        username: string;
        totalPoints: number;
        seasonPoints: number;
        perfectPicks: number;
        eventResults: { eventId: string; points: number }[];
      }
    >();

    for (const pick of allPicks) {
      const fantasyUserId = pick.fantasyUserId;
      const pickEventId = pick.eventId;
      const pointsEarned = pick.pointsEarned || 0;
      const username = pick.username || fantasyUserId.slice(0, 8);

      // Only count picks for completed events
      if (!completedEventIds.has(pickEventId)) continue;

      if (!userStats.has(fantasyUserId)) {
        userStats.set(fantasyUserId, {
          fantasyUserId,
          username,
          totalPoints: 0,
          seasonPoints: 0,
          perfectPicks: 0,
          eventResults: [],
        });
      }

      const stats = userStats.get(fantasyUserId)!;
      if (pick.username) {
        stats.username = pick.username;
      }

      stats.totalPoints += pointsEarned;
      stats.eventResults.push({ eventId: pickEventId, points: pointsEarned });

      // Count season points if filter applied
      if (!seasonEventIds || seasonEventIds.has(pickEventId)) {
        stats.seasonPoints += pointsEarned;
      }

      // Check for perfect picks (all picked wrestlers won)
      const breakdown = pick.breakdown;
      if (breakdown && pointsEarned > 0) {
        const allWon = Object.values(breakdown).every((b) => b.points > 0);
        if (allWon) {
          stats.perfectPicks += 1;
        }
      }
    }

    // Calculate streaks (consecutive events with points > 0)
    const completedEventsList = completedEvents
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => e.eventId);

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = [];

    for (const stats of userStats.values()) {
      let currentStreak = 0;
      const userEventPoints = new Map(
        stats.eventResults.map((r) => [r.eventId, r.points])
      );

      for (let i = completedEventsList.length - 1; i >= 0; i--) {
        const eid = completedEventsList[i];
        const pts = userEventPoints.get(eid);
        if (pts !== undefined && pts > 0) {
          currentStreak++;
        } else if (pts !== undefined && pts === 0) {
          break;
        }
      }

      entries.push({
        rank: 0,
        fantasyUserId: stats.fantasyUserId,
        username: stats.username,
        totalPoints: stats.totalPoints,
        currentSeasonPoints: seasonId ? stats.seasonPoints : stats.totalPoints,
        perfectPicks: stats.perfectPicks,
        currentStreak,
      });
    }

    // Sort by currentSeasonPoints descending, then by totalPoints
    entries.sort((a, b) => {
      if (b.currentSeasonPoints !== a.currentSeasonPoints) {
        return b.currentSeasonPoints - a.currentSeasonPoints;
      }
      return b.totalPoints - a.totalPoints;
    });

    // Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return success(entries);
  } catch (err) {
    console.error('Error fetching fantasy leaderboard:', err);
    return serverError('Failed to fetch fantasy leaderboard');
  }
};
