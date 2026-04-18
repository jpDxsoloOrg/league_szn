import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type { PromoCreateInput, PromosRepository } from '../PromosRepository';
import type { Promo, PromoType, ReactionType } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoPromosRepository implements PromosRepository {
  async findById(promoId: string): Promise<Promo | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.PROMOS,
      Key: { promoId },
    });
    return (result.Item as Promo | undefined) ?? null;
  }

  async list(): Promise<Promo[]> {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.PROMOS,
    });
    const promos = items as unknown as Promo[];
    promos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return promos;
  }

  async listByPlayer(playerId: string): Promise<Promo[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.PROMOS,
      IndexName: 'PlayerIndex',
      KeyConditionExpression: 'playerId = :pid',
      ExpressionAttributeValues: { ':pid': playerId },
      ScanIndexForward: false,
    });
    return items as unknown as Promo[];
  }

  async listByType(promoType: PromoType): Promise<Promo[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.PROMOS,
      IndexName: 'TypeIndex',
      KeyConditionExpression: 'promoType = :pt',
      ExpressionAttributeValues: { ':pt': promoType },
      ScanIndexForward: false,
    });
    return items as unknown as Promo[];
  }

  async listResponsesTo(targetPromoId: string): Promise<Promo[]> {
    // No GSI on targetPromoId, so scan with a filter.
    const items = await dynamoDb.scanAll({
      TableName: TableNames.PROMOS,
      FilterExpression: 'targetPromoId = :tpid',
      ExpressionAttributeValues: { ':tpid': targetPromoId },
    });
    const promos = items as unknown as Promo[];
    promos.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return promos;
  }

  async create(input: PromoCreateInput): Promise<Promo> {
    const now = new Date().toISOString();
    const item: Promo = {
      promoId: uuidv4(),
      playerId: input.playerId,
      promoType: input.promoType,
      title: input.title,
      content: input.content,
      targetPlayerId: input.targetPlayerId,
      targetPromoId: input.targetPromoId,
      matchId: input.matchId,
      championshipId: input.championshipId,
      imageUrl: input.imageUrl,
      challengeMode: input.challengeMode,
      challengerTagTeamName: input.challengerTagTeamName,
      targetTagTeamName: input.targetTagTeamName,
      reactions: {},
      reactionCounts: { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
      isPinned: false,
      isHidden: false,
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.PROMOS, Item: item });
    return item;
  }

  async update(promoId: string, patch: Partial<Promo>): Promise<Promo> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb
      .update({
        TableName: TableNames.PROMOS,
        Key: { promoId },
        UpdateExpression: expr.UpdateExpression,
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(promoId)',
        ReturnValues: 'ALL_NEW',
      })
      .catch((err: { name?: string }) => {
        if (err.name === 'ConditionalCheckFailedException') {
          throw new NotFoundError('Promo', promoId);
        }
        throw err;
      });
    return result.Attributes as Promo;
  }

  async delete(promoId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.PROMOS,
      Key: { promoId },
    });
  }

  async addReaction(promoId: string, userId: string, reaction: ReactionType): Promise<Promo> {
    const existing = await this.findById(promoId);
    if (!existing) throw new NotFoundError('Promo', promoId);

    const reactions = { ...existing.reactions };
    const reactionCounts = { ...existing.reactionCounts };

    // Remove previous reaction if the user already reacted
    const previousReaction = reactions[userId];
    if (previousReaction) {
      reactionCounts[previousReaction] = Math.max(0, (reactionCounts[previousReaction] || 0) - 1);
    }

    // Set the new reaction
    reactions[userId] = reaction;
    reactionCounts[reaction] = (reactionCounts[reaction] || 0) + 1;

    const now = new Date().toISOString();
    await dynamoDb.update({
      TableName: TableNames.PROMOS,
      Key: { promoId },
      UpdateExpression: 'SET reactions = :r, reactionCounts = :rc, updatedAt = :now',
      ExpressionAttributeValues: {
        ':r': reactions,
        ':rc': reactionCounts,
        ':now': now,
      },
    });

    return { ...existing, reactions, reactionCounts, updatedAt: now };
  }

  async removeReaction(promoId: string, userId: string): Promise<Promo> {
    const existing = await this.findById(promoId);
    if (!existing) throw new NotFoundError('Promo', promoId);

    const reactions = { ...existing.reactions };
    const reactionCounts = { ...existing.reactionCounts };

    const previousReaction = reactions[userId];
    if (previousReaction) {
      reactionCounts[previousReaction] = Math.max(0, (reactionCounts[previousReaction] || 0) - 1);
      delete reactions[userId];
    }

    const now = new Date().toISOString();
    await dynamoDb.update({
      TableName: TableNames.PROMOS,
      Key: { promoId },
      UpdateExpression: 'SET reactions = :r, reactionCounts = :rc, updatedAt = :now',
      ExpressionAttributeValues: {
        ':r': reactions,
        ':rc': reactionCounts,
        ':now': now,
      },
    });

    return { ...existing, reactions, reactionCounts, updatedAt: now };
  }
}
