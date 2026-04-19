import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, notFound, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return badRequest('challengeId is required');
    }

    const { user: { challenges }, roster: { players, tagTeams } } = getRepositories();

    const challenge = await challenges.findById(challengeId);
    if (!challenge) {
      return notFound('Challenge not found');
    }

    // Enrich with player names
    const [challengerPlayer, challengedPlayer] = await Promise.all([
      players.findById(challenge.challengerId),
      players.findById(challenge.challengedId),
    ]);

    const enriched: Record<string, unknown> = {
      ...challenge,
      challengeMode: challenge.challengeMode || 'singles',
      challenger: challengerPlayer
        ? { playerName: challengerPlayer.name, wrestlerName: challengerPlayer.currentWrestler, imageUrl: challengerPlayer.imageUrl }
        : { playerName: 'Unknown', wrestlerName: 'Unknown' },
      challenged: challengedPlayer
        ? { playerName: challengedPlayer.name, wrestlerName: challengedPlayer.currentWrestler, imageUrl: challengedPlayer.imageUrl }
        : { playerName: 'Unknown', wrestlerName: 'Unknown' },
    };

    // Enrich tag team challenge data
    if (challenge.challengeMode === 'tag_team' && challenge.challengerTagTeamId && challenge.challengedTagTeamId) {
      const [challengerTeam, challengedTeam] = await Promise.all([
        tagTeams.findById(challenge.challengerTagTeamId),
        tagTeams.findById(challenge.challengedTagTeamId),
      ]);

      if (challengerTeam && challengedTeam) {
        // Fetch all 4 tag team member players in parallel
        const [crP1, crP2, cdP1, cdP2] = await Promise.all([
          players.findById(challengerTeam.player1Id),
          players.findById(challengerTeam.player2Id),
          players.findById(challengedTeam.player1Id),
          players.findById(challengedTeam.player2Id),
        ]);

        const buildPlayerInfo = (player: { playerId: string; name: string; currentWrestler: string; imageUrl?: string } | null) => ({
          playerId: player ? player.playerId : undefined,
          playerName: player ? player.name : 'Unknown',
          wrestlerName: player ? player.currentWrestler : 'Unknown',
          imageUrl: player ? player.imageUrl : undefined,
        });

        enriched.challengerTagTeamId = challenge.challengerTagTeamId;
        enriched.challengedTagTeamId = challenge.challengedTagTeamId;
        enriched.challengerTagTeam = {
          tagTeamId: challenge.challengerTagTeamId,
          tagTeamName: challengerTeam.name,
          player1: buildPlayerInfo(crP1),
          player2: buildPlayerInfo(crP2),
        };
        enriched.challengedTagTeam = {
          tagTeamId: challenge.challengedTagTeamId,
          tagTeamName: challengedTeam.name,
          player1: buildPlayerInfo(cdP1),
          player2: buildPlayerInfo(cdP2),
        };
      }
    }

    return success(enriched);
  } catch (err) {
    console.error('Error fetching challenge:', err);
    return serverError('Failed to fetch challenge');
  }
};
