import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
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

    // Scan all fantasy picks
    const allPicks = await dynamoDb.scanAll({
      TableName: TableNames.FANTASY_PICKS,
    });

    // If filtering by season, get events for that season to filter picks
    let seasonEventIds: Set<string> | null = null;
    if (seasonId) {
      const eventsResult = await dynamoDb.scanAll({
        TableName: TableNames.EVENTS,
        FilterExpression: 'seasonId = :sid',
        ExpressionAttributeValues: { ':sid': seasonId },
      });
      seasonEventIds = new Set(eventsResult.map((e) => e.eventId as string));
    }

    // Get completed events to determine which picks have been scored
    const completedEvents = await dynamoDb.scanAll({
      TableName: TableNames.EVENTS,
      FilterExpression: '#status = :completed',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':completed': 'completed' },
    });
    const completedEventIds = new Set(completedEvents.map((e) => e.eventId as string));

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
      const fantasyUserId = pick.fantasyUserId as string;
      const pickEventId = pick.eventId as string;
      const pointsEarned = (pick.pointsEarned as number) || 0;
      const username = (pick.username as string) || fantasyUserId.slice(0, 8);

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
      // Update username to latest if available
      if (pick.username) {
        stats.username = pick.username as string;
      }

      stats.totalPoints += pointsEarned;
      stats.eventResults.push({ eventId: pickEventId, points: pointsEarned });

      // Count season points if filter applied
      if (!seasonEventIds || seasonEventIds.has(pickEventId)) {
        stats.seasonPoints += pointsEarned;
      }

      // Check for perfect picks (all picked wrestlers won)
      const breakdown = pick.breakdown as Record<string, { points: number }> | undefined;
      if (breakdown && pointsEarned > 0) {
        const allWon = Object.values(breakdown).every((b) => b.points > 0);
        if (allWon) {
          stats.perfectPicks += 1;
        }
      }
    }

    // Calculate streaks (consecutive events with points > 0)
    // Sort completed events by date for proper streak calculation
    const completedEventsList = completedEvents
      .sort((a, b) => (a.date as string).localeCompare(b.date as string))
      .map((e) => e.eventId as string);

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = [];

    for (const stats of userStats.values()) {
      // Calculate current streak
      let currentStreak = 0;
      const userEventPoints = new Map(
        stats.eventResults.map((r) => [r.eventId, r.points])
      );

      // Walk backwards through completed events
      for (let i = completedEventsList.length - 1; i >= 0; i--) {
        const eid = completedEventsList[i];
        const pts = userEventPoints.get(eid);
        if (pts !== undefined && pts > 0) {
          currentStreak++;
        } else if (pts !== undefined && pts === 0) {
          break; // Participated but scored 0 - streak broken
        }
        // If user didn't participate in this event, skip it (don't break streak)
      }

      entries.push({
        rank: 0, // Will be set after sorting
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
