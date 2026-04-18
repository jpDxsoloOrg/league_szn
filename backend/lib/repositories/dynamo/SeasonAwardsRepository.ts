import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import type {
  SeasonAwardCreateInput,
  SeasonAwardsRepository,
} from '../SeasonAwardsRepository';
import type { SeasonAward } from '../types';

export class DynamoSeasonAwardsRepository implements SeasonAwardsRepository {
  async listBySeason(seasonId: string): Promise<SeasonAward[]> {
    const result = await dynamoDb.query({
      TableName: TableNames.SEASON_AWARDS,
      KeyConditionExpression: '#seasonId = :seasonId',
      ExpressionAttributeNames: { '#seasonId': 'seasonId' },
      ExpressionAttributeValues: { ':seasonId': seasonId },
    });
    return (result.Items || []) as unknown as SeasonAward[];
  }

  async findById(seasonId: string, awardId: string): Promise<SeasonAward | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.SEASON_AWARDS,
      Key: { seasonId, awardId },
    });
    return (result.Item as SeasonAward | undefined) ?? null;
  }

  async create(input: SeasonAwardCreateInput): Promise<SeasonAward> {
    const now = new Date().toISOString();
    const item: SeasonAward = {
      awardId: uuidv4(),
      seasonId: input.seasonId,
      name: input.name,
      awardType: input.awardType,
      playerId: input.playerId,
      playerName: input.playerName,
      description: input.description ?? null,
      createdAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.SEASON_AWARDS, Item: item });
    return item;
  }

  async delete(seasonId: string, awardId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.SEASON_AWARDS,
      Key: { seasonId, awardId },
    });
  }

  async deleteAllForSeason(seasonId: string): Promise<number> {
    const items = await this.listBySeason(seasonId);
    for (const award of items) {
      await dynamoDb.delete({
        TableName: TableNames.SEASON_AWARDS,
        Key: { seasonId, awardId: award.awardId },
      });
    }
    return items.length;
  }
}
