import { getRepositories } from '../../lib/repositories';
import type { PointBreakdown } from '../../lib/repositories';

/**
 * Calculate and store fantasy points for all users who made picks for a completed event.
 * Called when autoCompleteEvent detects all matches in an event are finished.
 */
export async function calculateFantasyPoints(eventId: string): Promise<void> {
  const { events, fantasy, matches } = getRepositories();

  // 1. Get the event to find its match IDs
  const eventItem = await events.findById(eventId);
  if (!eventItem) {
    console.warn(`calculateFantasyPoints: Event ${eventId} not found`);
    return;
  }

  const matchCards = eventItem.matchCards || [];
  const matchIds = matchCards.map((c) => c.matchId).filter(Boolean);

  if (matchIds.length === 0) {
    console.warn(`calculateFantasyPoints: Event ${eventId} has no matches`);
    return;
  }

  // 2. Fetch fantasy config for scoring values
  const config = await fantasy.getConfig();
  const baseWinPoints = config?.baseWinPoints || 10;
  const championshipBonus = config?.championshipBonus || 5;
  const titleWinBonus = config?.titleWinBonus || 10;
  const titleDefenseBonus = config?.titleDefenseBonus ?? 5;

  // 3. Fetch all matches for this event
  const matchMap: Record<string, Record<string, unknown>> = {};
  for (const matchId of matchIds) {
    const match = await matches.findById(matchId);
    if (match && match.status === 'completed') {
      matchMap[matchId] = match as unknown as Record<string, unknown>;
    }
  }

  // 4. Build a map of playerId -> match results for quick lookup
  const playerMatchMap = new Map<string, { match: Record<string, unknown>; won: boolean }[]>();

  for (const match of Object.values(matchMap)) {
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
  const allPicks = await fantasy.listPicksByEvent(eventId);

  if (allPicks.length === 0) {
    console.log(`calculateFantasyPoints: No picks found for event ${eventId}`);
    return;
  }

  // 6. Calculate points for each user's picks
  for (const pickRecord of allPicks) {
    const picks = pickRecord.picks || {};
    const breakdown: Record<string, PointBreakdown> = {};
    let totalPoints = 0;

    // Iterate all picked players across all divisions
    for (const playerIds of Object.values(picks)) {
      for (const playerId of playerIds) {
        const playerResults = playerMatchMap.get(playerId);

        if (!playerResults || playerResults.length === 0) {
          breakdown[playerId] = {
            points: 0,
            basePoints: 0,
            multipliers: [],
            reason: 'Did not compete',
          };
          continue;
        }

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

          const matchBasePoints = (participantCount - 1) * baseWinPoints;
          playerBasePoints += matchBasePoints;
          playerPoints += matchBasePoints;

          const multiplierLabel = `${participantCount}-person match (${participantCount - 1}x)`;
          if (!allMultipliers.includes(multiplierLabel)) {
            allMultipliers.push(multiplierLabel);
          }

          if (match.isChampionship) {
            playerPoints += championshipBonus;
            allMultipliers.push(`Championship match (+${championshipBonus})`);

            const matchWinners = (match.winners as string[]) || [];
            if (matchWinners.includes(playerId)) {
              if (match.isTitleDefense) {
                playerPoints += titleDefenseBonus;
                allMultipliers.push(`Defended championship (+${titleDefenseBonus})`);
              } else {
                playerPoints += titleWinBonus;
                allMultipliers.push(`Won championship (+${titleWinBonus})`);
              }
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
    await fantasy.updatePickScoring(
      pickRecord.eventId,
      pickRecord.fantasyUserId,
      totalPoints,
      breakdown,
    );

    console.log(
      `Fantasy points calculated for user ${pickRecord.fantasyUserId} on event ${eventId}: ${totalPoints} points`
    );
  }
}
