import { dynamoDb, TableNames } from '../../dynamodb';
import type {
  ContenderRankingInput,
  ContenderOverrideInput,
  RankingHistoryInput,
  ContendersRepository,
} from '../ContendersRepository';
import type { ContenderRanking, ContenderOverride, RankingHistoryEntry } from '../types';

export class DynamoContendersRepository implements ContendersRepository {
  // ── Rankings ──────────────────────────────────────────────────────

  async listByChampionship(championshipId: string): Promise<ContenderRanking[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.CONTENDER_RANKINGS,
      KeyConditionExpression: 'championshipId = :cid',
      ExpressionAttributeValues: { ':cid': championshipId },
    });
    return items as unknown as ContenderRanking[];
  }

  async listByChampionshipRanked(championshipId: string): Promise<ContenderRanking[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.CONTENDER_RANKINGS,
      IndexName: 'RankIndex',
      KeyConditionExpression: 'championshipId = :cid',
      ExpressionAttributeValues: { ':cid': championshipId },
      ScanIndexForward: true,
    });
    return items as unknown as ContenderRanking[];
  }

  async deleteAllForChampionship(championshipId: string): Promise<void> {
    const existing = await this.listByChampionship(championshipId);
    for (const item of existing) {
      await dynamoDb.delete({
        TableName: TableNames.CONTENDER_RANKINGS,
        Key: {
          championshipId: item.championshipId,
          playerId: item.playerId,
        },
      });
    }
  }

  async upsertRanking(input: ContenderRankingInput): Promise<ContenderRanking> {
    const now = new Date().toISOString();
    const item: ContenderRanking = {
      championshipId: input.championshipId,
      playerId: input.playerId,
      rank: input.rank,
      rankingScore: input.rankingScore,
      winPercentage: input.winPercentage,
      currentStreak: input.currentStreak,
      qualityScore: input.qualityScore,
      recencyScore: input.recencyScore,
      matchesInPeriod: input.matchesInPeriod,
      winsInPeriod: input.winsInPeriod,
      previousRank: input.previousRank ?? null,
      peakRank: input.peakRank,
      weeksAtTop: input.weeksAtTop,
      isOverridden: input.isOverridden || false,
      overrideType: input.overrideType || null,
      organicRank: input.organicRank || null,
      calculatedAt: now,
      updatedAt: now,
    };

    await dynamoDb.put({
      TableName: TableNames.CONTENDER_RANKINGS,
      Item: item,
    });
    return item;
  }

  // ── Overrides ─────────────────────────────────────────────────────

  async findOverride(
    championshipId: string,
    playerId: string,
  ): Promise<ContenderOverride | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.CONTENDER_OVERRIDES,
      Key: { championshipId, playerId },
    });
    return (result.Item as ContenderOverride | undefined) ?? null;
  }

  async listActiveOverrides(championshipId?: string): Promise<ContenderOverride[]> {
    if (championshipId) {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.CONTENDER_OVERRIDES,
        IndexName: 'ActiveOverridesIndex',
        KeyConditionExpression: 'championshipId = :cid',
        FilterExpression: 'active = :active',
        ExpressionAttributeValues: {
          ':cid': championshipId,
          ':active': true,
        },
        ScanIndexForward: false,
      });
      return items as unknown as ContenderOverride[];
    }

    const items = await dynamoDb.scanAll({
      TableName: TableNames.CONTENDER_OVERRIDES,
      FilterExpression: 'active = :active',
      ExpressionAttributeValues: { ':active': true },
    });
    return items as unknown as ContenderOverride[];
  }

  async createOverride(input: ContenderOverrideInput): Promise<ContenderOverride> {
    const now = new Date().toISOString();
    const item: ContenderOverride = {
      championshipId: input.championshipId,
      playerId: input.playerId,
      overrideType: input.overrideType,
      reason: input.reason,
      createdBy: input.createdBy,
      createdAt: now,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      active: true,
    };

    await dynamoDb.put({
      TableName: TableNames.CONTENDER_OVERRIDES,
      Item: item,
    });
    return item;
  }

  async deactivateOverride(
    championshipId: string,
    playerId: string,
    reason: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await dynamoDb.update({
      TableName: TableNames.CONTENDER_OVERRIDES,
      Key: { championshipId, playerId },
      UpdateExpression: 'SET active = :false, removedAt = :now, removedReason = :reason',
      ExpressionAttributeValues: {
        ':false': false,
        ':now': now,
        ':reason': reason,
      },
    });
  }

  // ── Ranking history ───────────────────────────────────────────────

  async writeHistory(input: RankingHistoryInput): Promise<RankingHistoryEntry> {
    const now = new Date().toISOString();
    const item: RankingHistoryEntry = {
      playerId: input.playerId,
      weekKey: input.weekKey,
      championshipId: input.championshipId,
      rank: input.rank,
      rankingScore: input.rankingScore,
      movement: input.movement,
      isOverridden: input.isOverridden || false,
      overrideType: input.overrideType || null,
      organicRank: input.organicRank || null,
      createdAt: now,
    };

    await dynamoDb.put({
      TableName: TableNames.RANKING_HISTORY,
      Item: item,
    });
    return item;
  }
}
