import { dynamoDb, TableNames } from '../../lib/dynamodb';

interface PointBreakdown {
  points: number;
  basePoints: number;
  multipliers: string[];
  matchId?: string;
  reason: string;
}

/**
 * Calculate and store fantasy points for all users who made picks for a completed event.
 * Called when autoCompleteEvent detects all matches in an event are finished.
 */
export async function calculateFantasyPoints(eventId: string): Promise<void> {
  // 1. Get the event to find its match IDs
  const eventResult = await dynamoDb.get({
    TableName: TableNames.EVENTS,
    Key: { eventId },
  });

  const eventItem = eventResult.Item;
  if (!eventItem) {
    console.warn(`calculateFantasyPoints: Event ${eventId} not found`);
    return;
  }

  const matchCards = (eventItem.matchCards as Array<{ matchId: string }>) || [];
  const matchIds = matchCards.map((c) => c.matchId).filter(Boolean);

  if (matchIds.length === 0) {
    console.warn(`calculateFantasyPoints: Event ${eventId} has no matches`);
    return;
  }

  // 2. Fetch fantasy config for scoring values
  const configResult = await dynamoDb.get({
    TableName: TableNames.FANTASY_CONFIG,
    Key: { configKey: 'GLOBAL' },
  });

  const config = configResult.Item || {};
  const baseWinPoints = (config.baseWinPoints as number) || 10;
  const championshipBonus = (config.championshipBonus as number) || 5;
  const titleWinBonus = (config.titleWinBonus as number) || 10;

  // 3. Fetch all matches for this event
  const matches: Record<string, Record<string, unknown>> = {};
  for (const matchId of matchIds) {
    const matchResult = await dynamoDb.query({
      TableName: TableNames.MATCHES,
      KeyConditionExpression: 'matchId = :matchId',
      ExpressionAttributeValues: { ':matchId': matchId },
      Limit: 1,
    });

    const match = matchResult.Items?.[0];
    if (match && match.status === 'completed') {
      matches[matchId] = match;
    }
  }

  // 4. Build a map of playerId -> match results for quick lookup
  const playerMatchMap = new Map<string, { match: Record<string, unknown>; won: boolean }[]>();

  for (const match of Object.values(matches)) {
    const winners = (match.winners as string[]) || [];
    const losers = (match.losers as string[]) || [];
    const allParticipants = [...winners, ...losers];

    for (const playerId of allParticipants) {
      if (!playerMatchMap.has(playerId)) {
        playerMatchMap.set(playerId, []);
      }
      playerMatchMap.get(playerId)!.push({
        match,
        won: winners.includes(playerId),
      });
    }
  }

  // 5. Find all fantasy picks for this event
  const picksResult = await dynamoDb.scan({
    TableName: TableNames.FANTASY_PICKS,
    FilterExpression: 'eventId = :eid',
    ExpressionAttributeValues: { ':eid': eventId },
  });

  const allPicks = picksResult.Items || [];

  if (allPicks.length === 0) {
    console.log(`calculateFantasyPoints: No picks found for event ${eventId}`);
    return;
  }

  // 6. Calculate points for each user's picks
  for (const pickRecord of allPicks) {
    const picks = (pickRecord.picks as Record<string, string[]>) || {};
    const breakdown: Record<string, PointBreakdown> = {};
    let totalPoints = 0;

    // Iterate all picked players across all divisions
    for (const playerIds of Object.values(picks)) {
      for (const playerId of playerIds) {
        const playerResults = playerMatchMap.get(playerId);

        if (!playerResults || playerResults.length === 0) {
          // Player didn't compete in any match at this event
          breakdown[playerId] = {
            points: 0,
            basePoints: 0,
            multipliers: [],
            reason: 'Did not compete',
          };
          continue;
        }

        // Sum points across all matches this wrestler participated in
        let playerPoints = 0;
        let playerBasePoints = 0;
        const allMultipliers: string[] = [];
        let lastMatchId: string | undefined;
        let hasWin = false;

        for (const { match, won } of playerResults) {
          const matchId = match.matchId as string;
          lastMatchId = matchId;

          if (!won) continue;

          hasWin = true;
          const participants = [
            ...((match.winners as string[]) || []),
            ...((match.losers as string[]) || []),
          ];
          const participantCount = participants.length;

          // Points scale with match size: (participants - 1) * baseWinPoints
          const matchBasePoints = (participantCount - 1) * baseWinPoints;
          playerBasePoints += matchBasePoints;
          playerPoints += matchBasePoints;

          const multiplierLabel = `${participantCount}-person match (${participantCount - 1}x)`;
          if (!allMultipliers.includes(multiplierLabel)) {
            allMultipliers.push(multiplierLabel);
          }

          // Championship bonuses
          if (match.isChampionship) {
            playerPoints += championshipBonus;
            allMultipliers.push(`Championship match (+${championshipBonus})`);

            // Check if the wrestler actually won the championship match
            const matchWinners = (match.winners as string[]) || [];
            if (matchWinners.includes(playerId)) {
              playerPoints += titleWinBonus;
              allMultipliers.push(`Won championship (+${titleWinBonus})`);
            }
          }
        }

        totalPoints += playerPoints;
        breakdown[playerId] = {
          points: playerPoints,
          basePoints: playerBasePoints,
          multipliers: allMultipliers,
          matchId: lastMatchId,
          reason: hasWin ? 'Won match' : 'Lost match',
        };
      }
    }

    // 7. Update the picks record with calculated points
    const timestamp = new Date().toISOString();
    await dynamoDb.update({
      TableName: TableNames.FANTASY_PICKS,
      Key: {
        eventId: pickRecord.eventId as string,
        fantasyUserId: pickRecord.fantasyUserId as string,
      },
      UpdateExpression: 'SET pointsEarned = :pts, breakdown = :bd, updatedAt = :ts',
      ExpressionAttributeValues: {
        ':pts': totalPoints,
        ':bd': breakdown,
        ':ts': timestamp,
      },
    });

    console.log(
      `Fantasy points calculated for user ${pickRecord.fantasyUserId} on event ${eventId}: ${totalPoints} points`
    );
  }
}
