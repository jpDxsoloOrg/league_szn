import { dynamoDb, TableNames } from '../../dynamodb';
import type { ChampionshipsRepository } from '../ChampionshipsRepository';
import type { Championship, ChampionshipHistoryEntry } from '../types';

export class DynamoChampionshipsRepository implements ChampionshipsRepository {
  async findById(championshipId: string): Promise<Championship | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId },
    });
    return (result.Item as Championship | undefined) ?? null;
  }

  async list(): Promise<Championship[]> {
    return await dynamoDb.scanAll({ TableName: TableNames.CHAMPIONSHIPS }) as unknown as Championship[];
  }

  async listActive(): Promise<Championship[]> {
    const all = await this.list();
    return all.filter((c) => c.isActive !== false);
  }

  async listHistory(championshipId: string): Promise<ChampionshipHistoryEntry[]> {
    return await dynamoDb.queryAll({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      KeyConditionExpression: 'championshipId = :cid',
      ExpressionAttributeValues: { ':cid': championshipId },
    }) as unknown as ChampionshipHistoryEntry[];
  }

  async listAllHistory(): Promise<ChampionshipHistoryEntry[]> {
    return await dynamoDb.scanAll({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
    }) as unknown as ChampionshipHistoryEntry[];
  }

  async findCurrentReign(championshipId: string): Promise<ChampionshipHistoryEntry | null> {
    const result = await dynamoDb.query({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      KeyConditionExpression: 'championshipId = :cid',
      FilterExpression: 'attribute_not_exists(lostDate)',
      ExpressionAttributeValues: { ':cid': championshipId },
      ScanIndexForward: false,
      Limit: 1,
    });
    return ((result.Items?.[0]) as ChampionshipHistoryEntry | undefined) ?? null;
  }
}
