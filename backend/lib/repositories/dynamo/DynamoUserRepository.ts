import { QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import { buildUpdateExpression } from './util';
import type {
  UserRepository,
  NotificationsMethods,
  NotificationPage,
  FantasyMethods,
  FantasyPickInput,
  WrestlerCostInitInput,
  SiteConfigMethods,
  ChallengeCreateInput,
} from '../UserRepository';
import type {
  AppNotification,
  Challenge,
  ChallengeStatus,
  FantasyConfig,
  FantasyPick,
  WrestlerCost,
} from '../types';
import type { FeatureFlags } from '../SiteConfigRepository';
import { DEFAULT_FEATURES } from '../SiteConfigRepository';
import type { CrudRepository } from '../CrudRepository';

// ─── Notifications sub-object ──────────────────────────────────────

class NotificationsDelegate implements NotificationsMethods {
  async listByUser(userId: string, limit: number, cursor?: string): Promise<NotificationPage> {
    const queryParams: QueryCommandInput = {
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ScanIndexForward: false,
      Limit: limit,
    };

    if (cursor) {
      queryParams.ExclusiveStartKey = { userId, createdAt: cursor };
    }

    const result = await dynamoDb.query(queryParams);
    const notifications = (result.Items || []) as unknown as AppNotification[];
    const lastKey = result.LastEvaluatedKey as Record<string, string> | undefined;

    return {
      notifications,
      nextCursor: lastKey?.createdAt || null,
    };
  }

  async countUnread(userId: string): Promise<number> {
    const result = await dynamoDb.queryAll({
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'isRead = :false',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':false': false,
      },
    });
    return result.length;
  }

  async findByNotificationId(notificationId: string): Promise<AppNotification | null> {
    const gsiResult = await dynamoDb.query({
      TableName: TableNames.NOTIFICATIONS,
      IndexName: 'NotificationIdIndex',
      KeyConditionExpression: 'notificationId = :nid',
      ExpressionAttributeValues: { ':nid': notificationId },
    });
    return (gsiResult.Items?.[0] as unknown as AppNotification) ?? null;
  }

  async markRead(userId: string, createdAt: string): Promise<void> {
    const now = new Date().toISOString();
    await dynamoDb.update({
      TableName: TableNames.NOTIFICATIONS,
      Key: { userId, createdAt },
      UpdateExpression: 'SET isRead = :true, updatedAt = :now',
      ExpressionAttributeValues: { ':true': true, ':now': now },
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const unreadItems = await dynamoDb.queryAll({
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'isRead = :false',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':false': false,
      },
    });

    if (unreadItems.length === 0) return 0;

    const now = new Date().toISOString();
    await Promise.all(
      unreadItems.map((item) =>
        dynamoDb.update({
          TableName: TableNames.NOTIFICATIONS,
          Key: {
            userId: item.userId as string,
            createdAt: item.createdAt as string,
          },
          UpdateExpression: 'SET isRead = :true, updatedAt = :now',
          ExpressionAttributeValues: { ':true': true, ':now': now },
        }),
      ),
    );

    return unreadItems.length;
  }

  async delete(userId: string, createdAt: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.NOTIFICATIONS,
      Key: { userId, createdAt },
    });
  }

  async deleteAllRead(userId: string): Promise<number> {
    const readItems = await dynamoDb.queryAll({
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'isRead = :true',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':true': true,
      },
    });

    if (readItems.length === 0) return 0;

    await Promise.all(
      readItems.map((item) =>
        dynamoDb.delete({
          TableName: TableNames.NOTIFICATIONS,
          Key: {
            userId: item.userId as string,
            createdAt: item.createdAt as string,
          },
        }),
      ),
    );

    return readItems.length;
  }
}

// ─── Challenges sub-object ─────────────────────────────────────────

class ChallengesDelegate
  implements CrudRepository<Challenge, ChallengeCreateInput, Partial<Challenge>>
{
  async findById(challengeId: string): Promise<Challenge | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId },
    });
    return (result.Item as Challenge | undefined) ?? null;
  }

  async list(): Promise<Challenge[]> {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.CHALLENGES,
    });
    const challenges = items as unknown as Challenge[];
    challenges.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return challenges;
  }

  async listByStatus(status: ChallengeStatus): Promise<Challenge[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.CHALLENGES,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#s = :status',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: false,
    });
    return items as unknown as Challenge[];
  }

  async listByChallenger(playerId: string): Promise<Challenge[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.CHALLENGES,
      IndexName: 'ChallengerIndex',
      KeyConditionExpression: 'challengerId = :pid',
      ExpressionAttributeValues: { ':pid': playerId },
      ScanIndexForward: false,
    });
    return items as unknown as Challenge[];
  }

  async listByChallenged(playerId: string): Promise<Challenge[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.CHALLENGES,
      IndexName: 'ChallengedIndex',
      KeyConditionExpression: 'challengedId = :pid',
      ExpressionAttributeValues: { ':pid': playerId },
      ScanIndexForward: false,
    });
    return items as unknown as Challenge[];
  }

  async listByPlayer(playerId: string): Promise<Challenge[]> {
    const [sent, received] = await Promise.all([
      this.listByChallenger(playerId),
      this.listByChallenged(playerId),
    ]);

    // Deduplicate by challengeId
    const seen = new Set<string>();
    const merged: Challenge[] = [];
    for (const challenge of [...sent, ...received]) {
      if (!seen.has(challenge.challengeId)) {
        seen.add(challenge.challengeId);
        merged.push(challenge);
      }
    }

    merged.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return merged;
  }

  async create(input: ChallengeCreateInput): Promise<Challenge> {
    const now = new Date().toISOString();
    const item: Challenge = {
      challengeId: uuidv4(),
      challengerId: input.challengerId,
      challengedId: input.challengedId,
      matchType: input.matchType,
      ...(input.stipulation !== undefined ? { stipulation: input.stipulation } : {}),
      ...(input.championshipId !== undefined ? { championshipId: input.championshipId } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
      ...(input.challengeMode !== undefined ? { challengeMode: input.challengeMode } : {}),
      ...(input.challengerTagTeamId !== undefined ? { challengerTagTeamId: input.challengerTagTeamId } : {}),
      ...(input.challengedTagTeamId !== undefined ? { challengedTagTeamId: input.challengedTagTeamId } : {}),
      status: 'pending',
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.CHALLENGES, Item: item });
    return item;
  }

  async update(
    challengeId: string,
    patch: Partial<Challenge>,
  ): Promise<Challenge> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb
      .update({
        TableName: TableNames.CHALLENGES,
        Key: { challengeId },
        UpdateExpression: expr.UpdateExpression,
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(challengeId)',
        ReturnValues: 'ALL_NEW',
      })
      .catch((err: { name?: string }) => {
        if (err.name === 'ConditionalCheckFailedException') {
          throw new NotFoundError('Challenge', challengeId);
        }
        throw err;
      });
    return result.Attributes as Challenge;
  }

  async delete(challengeId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.CHALLENGES,
      Key: { challengeId },
    });
  }
}

// ─── Fantasy sub-object ────────────────────────────────────────────

class FantasyDelegate implements FantasyMethods {
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

// ─── Site config sub-object ────────────────────────────────────────

class SiteConfigDelegate implements SiteConfigMethods {
  async getFeatures(): Promise<FeatureFlags> {
    const result = await dynamoDb.get({
      TableName: TableNames.SITE_CONFIG,
      Key: { configKey: 'features' },
    });

    if (result.Item?.features) {
      return result.Item.features as FeatureFlags;
    }

    return { ...DEFAULT_FEATURES };
  }

  async updateFeatures(patch: Partial<FeatureFlags>): Promise<FeatureFlags> {
    const current = await this.getFeatures();
    const updated = { ...current, ...patch };

    await dynamoDb.put({
      TableName: TableNames.SITE_CONFIG,
      Item: {
        configKey: 'features',
        features: updated,
        updatedAt: new Date().toISOString(),
      },
    });

    return updated;
  }
}

// ─── Aggregate repository ──────────────────────────────────────────

export class DynamoUserRepository implements UserRepository {
  readonly notifications: NotificationsMethods = new NotificationsDelegate();
  readonly challenges: CrudRepository<Challenge, ChallengeCreateInput, Partial<Challenge>> & {
    listByStatus(status: ChallengeStatus): Promise<Challenge[]>;
    listByChallenger(playerId: string): Promise<Challenge[]>;
    listByChallenged(playerId: string): Promise<Challenge[]>;
    listByPlayer(playerId: string): Promise<Challenge[]>;
  } = new ChallengesDelegate();
  readonly fantasy: FantasyMethods = new FantasyDelegate();
  readonly siteConfig: SiteConfigMethods = new SiteConfigDelegate();
}
