import { APIGatewayProxyHandler } from 'aws-lambda';
import { success, serverError } from '../../lib/response';
import {
  fetchActiveStables,
  fetchCompletedMatches,
  buildPlayerToStableMap,
  computeStableMatchResults,
  computeFormAndStreak,
  computeWinPercentage,
} from './computeStableStats';

// Note: fetchActiveStables and fetchCompletedMatches use dynamoDb directly — matches/stables scan migration deferred to Wave 5+

interface StableStanding {
  stableId: string;
  name: string;
  imageUrl?: string;
  memberCount: number;
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number;
  recentForm: string[];
  currentStreak: string;
}

export const handler: APIGatewayProxyHandler = async () => {
  try {
    // Fetch stables and matches in parallel
    const [stables, matches] = await Promise.all([
      fetchActiveStables(),
      fetchCompletedMatches(),
    ]);

    const playerToStable = buildPlayerToStableMap(stables);

    const standings: StableStanding[] = stables.map((stable) => {
      const results = computeStableMatchResults(matches, stable, playerToStable);
      const { recentForm, currentStreak } = computeFormAndStreak(results, 10);

      // Compute W/L/D from actual match results
      let wins = 0;
      let losses = 0;
      let draws = 0;
      for (const r of results) {
        if (r.outcome === 'W') wins++;
        else if (r.outcome === 'L') losses++;
        else draws++;
      }

      return {
        stableId: stable.stableId,
        name: stable.name,
        imageUrl: stable.imageUrl,
        memberCount: stable.memberIds.length,
        wins,
        losses,
        draws,
        winPercentage: computeWinPercentage(wins, losses, draws),
        recentForm,
        currentStreak,
      };
    });

    // Sort by wins descending, then fewest losses
    standings.sort((a, b) => b.wins - a.wins || a.losses - b.losses);

    return success(standings);
  } catch (err) {
    console.error('Error fetching stable standings:', err);
    return serverError('Failed to fetch stable standings');
  }
};
