import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  ChallengeCreateInput,
  ChallengesRepository,
} from '../ChallengesRepository';
import type { Challenge, ChallengeStatus } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoChallengesRepository implements ChallengesRepository {
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
