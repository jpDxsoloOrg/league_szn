import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { isPlayerVisible } from '../../lib/needsWrestler';
import { hasHiddenMember } from './tagTeamVisibility';
import {
  TagTeamRecord,
  FormResult,
  fetchCompletedMatches,
  buildTagTeamMatchMap,
  computeFormAndStreak,
  computeTagTeamRecord,
  resolveMemberName,
} from './computeTagTeamStats';
import { computeWinPercentage } from '../../lib/stats/record';

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
    const playerMap = new Map<string, { name: string }>();
    const hiddenIds = new Set<string>();
    for (const player of playerResults) {
      if (player) {
        playerMap.set(player.playerId, player);
        if (!isPlayerVisible(player)) hiddenIds.add(player.playerId);
      }
    }

    // Cast to TagTeamRecord for computeTagTeamStats utilities
    const tagTeamRecords = tagTeams as unknown as TagTeamRecord[];

    // Build match results map for all tag teams in one pass
    const matchMap = buildTagTeamMatchMap(tagTeamRecords, completedMatches);

    // Build standings with recentForm and currentStreak
    const listedTagTeams = tagTeams.filter((team) => !hasHiddenMember(team, hiddenIds));
    const standings: TagTeamStanding[] = listedTagTeams.map((team) => {
      const teamMatches = matchMap.get(team.tagTeamId) || [];
      const { wins, losses, draws } = computeTagTeamRecord(teamMatches);
      const winPercentage = computeWinPercentage(wins, losses, draws);
      const { recentForm, currentStreak } = computeFormAndStreak(teamMatches, 10);

      return {
        tagTeamId: team.tagTeamId,
        name: team.name,
        imageUrl: team.imageUrl,
        player1Name: resolveMemberName(playerMap.get(team.player1Id), team.player1WrestlerName),
        player2Name: resolveMemberName(playerMap.get(team.player2Id), team.player2WrestlerName),
        wins,
        losses,
        draws,
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
