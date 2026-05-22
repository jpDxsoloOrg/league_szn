import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, dynamoDb, TableNames } from '../../dynamodb';
import {
  RatingAlreadyExistsError,
  type MatchRatingCreateInput,
  type MatchRatingsRepository,
} from '../matchRatings';
import type { MatchRating } from '../types';

const BATCH_GET_CHUNK = 100; // DynamoDB BatchGetItem hard limit per request.

interface MatchRatingRow {
  matchId: string;
  userId: string;
  rating: number;
  createdAt: string;
}

const toDomain = (row: MatchRatingRow): MatchRating => ({
  matchId: row.matchId,
  userId: row.userId,
  rating: row.rating,
  createdAt: row.createdAt,
});

const isConditionalCheckFailed = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const { name } = err as { name?: unknown };
  return name === 'ConditionalCheckFailedException';
};

export class DynamoMatchRatingsRepository implements MatchRatingsRepository {
  async create(input: MatchRatingCreateInput): Promise<MatchRating> {
    const row: MatchRatingRow = {
      matchId: input.matchId,
      userId: input.userId,
      rating: input.rating,
      createdAt: new Date().toISOString(),
    };
    try {
      await dynamoDb.put({
        TableName: TableNames.MATCH_RATINGS,
        Item: row,
        ConditionExpression: 'attribute_not_exists(matchId)',
      });
    } catch (err: unknown) {
      if (isConditionalCheckFailed(err)) {
        throw new RatingAlreadyExistsError(input.matchId, input.userId);
      }
      throw err;
    }
    return toDomain(row);
  }

  async getByMatch(matchId: string): Promise<MatchRating[]> {
    const items = (await dynamoDb.queryAll({
      TableName: TableNames.MATCH_RATINGS,
      KeyConditionExpression: '#m = :matchId',
      ExpressionAttributeNames: { '#m': 'matchId' },
      ExpressionAttributeValues: { ':matchId': matchId },
    })) as unknown as MatchRatingRow[];
    return items.map(toDomain);
  }

  async findByMatchAndUser(
    matchId: string,
    userId: string,
  ): Promise<MatchRating | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.MATCH_RATINGS,
      Key: { matchId, userId },
    });
    if (!result.Item) return null;
    return toDomain(result.Item as MatchRatingRow);
  }

  async getByMatchIdsForUser(
    matchIdsArg: string[],
    userId: string,
  ): Promise<MatchRating[]> {
    // De-duplicate so a duplicated matchId doesn't waste a BatchGet slot.
    const matchIds = Array.from(new Set(matchIdsArg));
    if (matchIds.length === 0) return [];

    const out: MatchRating[] = [];
    for (let i = 0; i < matchIds.length; i += BATCH_GET_CHUNK) {
      const chunk = matchIds.slice(i, i + BATCH_GET_CHUNK);
      let requestItems: Record<string, { Keys: Array<Record<string, unknown>> }> = {
        [TableNames.MATCH_RATINGS]: {
          Keys: chunk.map((matchId) => ({ matchId, userId })),
        },
      };
      // BatchGet can return `UnprocessedKeys` under load — retry until empty.
      while (Object.keys(requestItems).length > 0) {
        const result = await docClient.send(
          new BatchGetCommand({ RequestItems: requestItems }),
        );
        const rows = (result.Responses?.[TableNames.MATCH_RATINGS] ??
          []) as MatchRatingRow[];
        for (const row of rows) out.push(toDomain(row));
        const unprocessed = result.UnprocessedKeys?.[TableNames.MATCH_RATINGS];
        if (unprocessed && (unprocessed.Keys?.length ?? 0) > 0) {
          requestItems = {
            [TableNames.MATCH_RATINGS]: {
              Keys: unprocessed.Keys as Array<Record<string, unknown>>,
            },
          };
        } else {
          requestItems = {};
        }
      }
    }
    return out;
  }
}
