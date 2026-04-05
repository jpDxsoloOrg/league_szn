import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, notFound, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return badRequest('challengeId is required');
    }

    const result = await dynamoDb.get({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId },
    });

    const challenge = result.Item;
    if (!challenge) {
      return notFound('Challenge not found');
    }

    // Enrich with player names
    const playerIds = new Set<string>();
    playerIds.add(challenge.challengerId as string);
    if (challenge.challengedId) playerIds.add(challenge.challengedId as string);
    const oppIds = (challenge.opponentIds as string[] | undefined) || (challenge.challengedId ? [challenge.challengedId as string] : []);
    for (const id of oppIds) playerIds.add(id);

    const playerMap: Record<string, { name: string; currentWrestler: string; imageUrl?: string }> = {};
    for (const pid of playerIds) {
      const playerResult = await dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId: pid },
      });
      if (playerResult.Item) {
        playerMap[pid] = {
          name: playerResult.Item.name as string,
          currentWrestler: playerResult.Item.currentWrestler as string,
          imageUrl: playerResult.Item.imageUrl as string | undefined,
        };
      }
    }

    const challenger = playerMap[challenge.challengerId as string];
    const challenged = playerMap[challenge.challengedId as string];

    const opponents = oppIds.map((pid) => {
      const info = playerMap[pid];
      return info
        ? { playerId: pid, playerName: info.name, wrestlerName: info.currentWrestler, imageUrl: info.imageUrl }
        : { playerId: pid, playerName: 'Unknown', wrestlerName: 'Unknown' };
    });

    const enriched: Record<string, unknown> = {
      ...challenge,
      opponentIds: oppIds,
      opponents,
      challengeMode: (challenge.challengeMode as string) || 'singles',
      challenger: challenger
        ? { playerName: challenger.name, wrestlerName: challenger.currentWrestler, imageUrl: challenger.imageUrl }
        : { playerName: 'Unknown', wrestlerName: 'Unknown' },
      challenged: challenged
        ? { playerName: challenged.name, wrestlerName: challenged.currentWrestler, imageUrl: challenged.imageUrl }
        : { playerName: 'Unknown', wrestlerName: 'Unknown' },
    };

    // Enrich tag team challenge data
    if (challenge.challengeMode === 'tag_team' && challenge.challengerTagTeamId && challenge.challengedTagTeamId) {
      const [challengerTeamResult, challengedTeamResult] = await Promise.all([
        dynamoDb.get({ TableName: TableNames.TAG_TEAMS, Key: { tagTeamId: challenge.challengerTagTeamId as string } }),
        dynamoDb.get({ TableName: TableNames.TAG_TEAMS, Key: { tagTeamId: challenge.challengedTagTeamId as string } }),
      ]);

      const challengerTeam = challengerTeamResult.Item;
      const challengedTeam = challengedTeamResult.Item;

      if (challengerTeam && challengedTeam) {
        // Fetch all 4 tag team member players in parallel
        const [crP1Result, crP2Result, cdP1Result, cdP2Result] = await Promise.all([
          dynamoDb.get({ TableName: TableNames.PLAYERS, Key: { playerId: challengerTeam.player1Id as string } }),
          dynamoDb.get({ TableName: TableNames.PLAYERS, Key: { playerId: challengerTeam.player2Id as string } }),
          dynamoDb.get({ TableName: TableNames.PLAYERS, Key: { playerId: challengedTeam.player1Id as string } }),
          dynamoDb.get({ TableName: TableNames.PLAYERS, Key: { playerId: challengedTeam.player2Id as string } }),
        ]);

        const buildPlayerInfo = (item: Record<string, unknown> | undefined) => ({
          playerId: item ? (item.playerId as string) : undefined,
          playerName: item ? (item.name as string) : 'Unknown',
          wrestlerName: item ? (item.currentWrestler as string) : 'Unknown',
          imageUrl: item ? (item.imageUrl as string | undefined) : undefined,
        });

        enriched.challengerTagTeamId = challenge.challengerTagTeamId as string;
        enriched.challengedTagTeamId = challenge.challengedTagTeamId as string;
        enriched.challengerTagTeam = {
          tagTeamId: challenge.challengerTagTeamId as string,
          tagTeamName: challengerTeam.name as string,
          player1: buildPlayerInfo(crP1Result.Item),
          player2: buildPlayerInfo(crP2Result.Item),
        };
        enriched.challengedTagTeam = {
          tagTeamId: challenge.challengedTagTeamId as string,
          tagTeamName: challengedTeam.name as string,
          player1: buildPlayerInfo(cdP1Result.Item),
          player2: buildPlayerInfo(cdP2Result.Item),
        };
      }
    }

    return success(enriched);
  } catch (err) {
    console.error('Error fetching challenge:', err);
    return serverError('Failed to fetch challenge');
  }
};
