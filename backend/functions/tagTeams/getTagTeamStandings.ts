import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import {
  TagTeamRecord,
  FormResult,
  fetchCompletedMatches,
  buildTagTeamMatchMap,
  computeFormAndStreak,
} from './computeTagTeamStats';

interface TagTeamStanding {
  tagTeamId: string;
  name: string;
  imageUrl?: string;
  player1Name: string;
  player2Name: string;
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number;
  recentForm: FormResult[];
  currentStreak: { type: FormResult; count: number };
}

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { roster: { tagTeams: tagTeamsRepo, players: playersRepo } } = getRepositories();

    // Get all active tag teams via repo
    const tagTeams = await tagTeamsRepo.listByStatus('active');

    if (tagTeams.length === 0) {
      return success([]);
    }

    // Collect all unique player IDs
    const playerIds = new Set<string>();
    for (const team of tagTeams) {
      playerIds.add(team.player1Id);
      playerIds.add(team.player2Id);
    }

    // Fetch player names and completed matches in parallel
    // Note: completedMatches uses dynamoDb directly — matches migration deferred to Wave 5+
    const [playerResults, completedMatches] = await Promise.all([
      Promise.all(Array.from(playerIds).map((playerId) => playersRepo.findById(playerId))),
      fetchCompletedMatches(),
    ]);

    // Build player name map
    const playerMap = new Map<string, string>();
    for (const player of playerResults) {
      if (player) {
        playerMap.set(player.playerId, player.name);
      }
    }

    // Cast to TagTeamRecord for computeTagTeamStats utilities
    const tagTeamRecords = tagTeams as unknown as TagTeamRecord[];

    // Build match results map for all tag teams in one pass
    const matchMap = buildTagTeamMatchMap(tagTeamRecords, completedMatches);

    // Build standings with recentForm and currentStreak
    const standings: TagTeamStanding[] = tagTeams.map((team) => {
      const totalMatches = team.wins + team.losses + team.draws;
      const winPercentage =
        totalMatches > 0
          ? Math.round((team.wins / totalMatches) * 1000) / 1000
          : 0;

      const teamMatches = matchMap.get(team.tagTeamId) || [];
      const { recentForm, currentStreak } = computeFormAndStreak(teamMatches, 10);

      return {
        tagTeamId: team.tagTeamId,
        name: team.name,
        imageUrl: team.imageUrl,
        player1Name: playerMap.get(team.player1Id) || 'Unknown',
        player2Name: playerMap.get(team.player2Id) || 'Unknown',
        wins: team.wins,
        losses: team.losses,
        draws: team.draws,
        winPercentage,
        recentForm,
        currentStreak,
      };
    });

    // Sort by wins descending, then by win percentage descending
    standings.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.winPercentage - a.winPercentage;
    });

    return success(standings);
  } catch (err) {
    console.error('Error fetching tag team standings:', err);
    return serverError('Failed to fetch tag team standings');
  }
};
