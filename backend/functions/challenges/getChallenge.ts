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
    playerIds.add(challenge.challengedId as string);

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

    const enriched = {
      ...challenge,
      challenger: challenger
        ? { playerName: challenger.name, wrestlerName: challenger.currentWrestler, imageUrl: challenger.imageUrl }
        : { playerName: 'Unknown', wrestlerName: 'Unknown' },
      challenged: challenged
        ? { playerName: challenged.name, wrestlerName: challenged.currentWrestler, imageUrl: challenged.imageUrl }
        : { playerName: 'Unknown', wrestlerName: 'Unknown' },
    };

    return success(enriched);
  } catch (err) {
    console.error('Error fetching challenge:', err);
    return serverError('Failed to fetch challenge');
  }
};
