import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { status, playerId } = event.queryStringParameters || {};

    let challenges: Record<string, unknown>[];

    if (playerId) {
      // Query both indexes and merge results
      const [sentResult, receivedResult] = await Promise.all([
        dynamoDb.queryAll({
          TableName: TableNames.CHALLENGES,
          IndexName: 'ChallengerIndex',
          KeyConditionExpression: 'challengerId = :pid',
          ExpressionAttributeValues: { ':pid': playerId },
          ScanIndexForward: false,
        }),
        dynamoDb.queryAll({
          TableName: TableNames.CHALLENGES,
          IndexName: 'ChallengedIndex',
          KeyConditionExpression: 'challengedId = :pid',
          ExpressionAttributeValues: { ':pid': playerId },
          ScanIndexForward: false,
        }),
      ]);

      // Deduplicate by challengeId
      const seen = new Set<string>();
      challenges = [];
      for (const c of [...sentResult, ...receivedResult]) {
        if (!seen.has(c.challengeId as string)) {
          seen.add(c.challengeId as string);
          challenges.push(c);
        }
      }
    } else if (status) {
      challenges = await dynamoDb.queryAll({
        TableName: TableNames.CHALLENGES,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#s = :status',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,
      });
    } else {
      challenges = await dynamoDb.scanAll({
        TableName: TableNames.CHALLENGES,
      });
    }

    // Enrich with player names
    const playerIds = new Set<string>();
    for (const c of challenges) {
      playerIds.add(c.challengerId as string);
      playerIds.add(c.challengedId as string);
    }

    const playerMap: Record<string, { name: string; currentWrestler: string; imageUrl?: string }> = {};
    for (const pid of playerIds) {
      const result = await dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId: pid },
      });
      if (result.Item) {
        playerMap[pid] = {
          name: result.Item.name as string,
          currentWrestler: result.Item.currentWrestler as string,
          imageUrl: result.Item.imageUrl as string | undefined,
        };
      }
    }

    const enriched = challenges.map((c) => {
      const challenger = playerMap[c.challengerId as string];
      const challenged = playerMap[c.challengedId as string];
      return {
        ...c,
        challenger: challenger
          ? { playerName: challenger.name, wrestlerName: challenger.currentWrestler, imageUrl: challenger.imageUrl }
          : { playerName: 'Unknown', wrestlerName: 'Unknown' },
        challenged: challenged
          ? { playerName: challenged.name, wrestlerName: challenged.currentWrestler, imageUrl: challenged.imageUrl }
          : { playerName: 'Unknown', wrestlerName: 'Unknown' },
      };
    });

    // Sort by createdAt descending
    enriched.sort((a: any, b: any) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());

    return success(enriched);
  } catch (err) {
    console.error('Error fetching challenges:', err);
    return serverError('Failed to fetch challenges');
  }
};
