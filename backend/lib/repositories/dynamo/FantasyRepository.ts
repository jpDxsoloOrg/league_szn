import { dynamoDb, TableNames } from '../../dynamodb';
import type {
  FantasyPickInput,
  WrestlerCostInitInput,
  FantasyRepository,
} from '../FantasyRepository';
import type { FantasyConfig, FantasyPick, WrestlerCost } from '../types';


export class DynamoFantasyRepository implements FantasyRepository {
  // ── Config ────────────────────────────────────────────────────────

  async getConfig(): Promise<FantasyConfig | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.FANTASY_CONFIG,
      Key: { configKey: 'GLOBAL' },
    });
    return (result.Item as FantasyConfig | undefined) ?? null;
  }

  async upsertConfig(patch: Partial<FantasyConfig>): Promise<FantasyConfig> {
    const existing = await this.getConfig();
    const updated: FantasyConfig = {
      ...(existing || {}),
      ...patch,
      configKey: 'GLOBAL',
    } as FantasyConfig;

    await dynamoDb.put({
      TableName: TableNames.FANTASY_CONFIG,
      Item: updated,
    });
    return updated;
  }

  // ── Picks ─────────────────────────────────────────────────────────

  async findPick(eventId: string, fantasyUserId: string): Promise<FantasyPick | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.FANTASY_PICKS,
      Key: { eventId, fantasyUserId },
    });
    return (result.Item as FantasyPick | undefined) ?? null;
  }

  async listPicksByEvent(eventId: string): Promise<FantasyPick[]> {
    const result = await dynamoDb.query({
      TableName: TableNames.FANTASY_PICKS,
      KeyConditionExpression: 'eventId = :eid',
      ExpressionAttributeValues: { ':eid': eventId },
    });
    return (result.Items || []) as unknown as FantasyPick[];
  }

  async listPicksByUser(fantasyUserId: string): Promise<FantasyPick[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.FANTASY_PICKS,
      IndexName: 'UserPicksIndex',
      KeyConditionExpression: 'fantasyUserId = :uid',
      ExpressionAttributeValues: { ':uid': fantasyUserId },
    });
    return items as unknown as FantasyPick[];
  }

  async listAllPicks(): Promise<FantasyPick[]> {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.FANTASY_PICKS,
    });
    return items as unknown as FantasyPick[];
  }

  async savePick(input: FantasyPickInput, existingCreatedAt?: string): Promise<FantasyPick> {
    const timestamp = new Date().toISOString();
    const item: FantasyPick = {
      eventId: input.eventId,
      fantasyUserId: input.fantasyUserId,
      username: input.username,
      picks: input.picks,
      totalSpent: input.totalSpent,
      createdAt: existingCreatedAt || timestamp,
      updatedAt: timestamp,
    };

    await dynamoDb.put({
      TableName: TableNames.FANTASY_PICKS,
      Item: item,
    });
    return item;
  }

  async updatePickScoring(
    eventId: string,
    fantasyUserId: string,
    pointsEarned: number,
    breakdown: Record<string, unknown>,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await dynamoDb.update({
      TableName: TableNames.FANTASY_PICKS,
      Key: { eventId, fantasyUserId },
      UpdateExpression: 'SET pointsEarned = :pts, breakdown = :bd, updatedAt = :ts',
      ExpressionAttributeValues: {
        ':pts': pointsEarned,
        ':bd': breakdown,
        ':ts': timestamp,
      },
    });
  }

  async deletePick(eventId: string, fantasyUserId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.FANTASY_PICKS,
      Key: { eventId, fantasyUserId },
    });
  }

  // ── Wrestler costs ────────────────────────────────────────────────

  async findCost(playerId: string): Promise<WrestlerCost | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.WRESTLER_COSTS,
      Key: { playerId },
    });
    return (result.Item as WrestlerCost | undefined) ?? null;
  }

  async listAllCosts(): Promise<WrestlerCost[]> {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.WRESTLER_COSTS,
    });
    return items as unknown as WrestlerCost[];
  }

  async upsertCost(cost: WrestlerCost): Promise<WrestlerCost> {
    await dynamoDb.put({
      TableName: TableNames.WRESTLER_COSTS,
      Item: cost,
    });
    return cost;
  }

  async initializeCost(input: WrestlerCostInitInput): Promise<WrestlerCost> {
    const timestamp = new Date().toISOString();
    const today = timestamp.split('T')[0];
    const item: WrestlerCost = {
      playerId: input.playerId,
      currentCost: input.baseCost,
      baseCost: input.baseCost,
      costHistory: [{ date: today, cost: input.baseCost, reason: 'Initialized' }],
      winRate30Days: 0,
      recentRecord: '0-0',
      updatedAt: timestamp,
    };

    await dynamoDb.put({
      TableName: TableNames.WRESTLER_COSTS,
      Item: item,
    });
    return item;
  }
}
