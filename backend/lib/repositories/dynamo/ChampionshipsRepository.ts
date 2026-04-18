import { dynamoDb, TableNames } from '../../dynamodb';
import { buildUpdateExpression } from './util';
import { NotFoundError } from '../errors';
import { v4 as uuidv4 } from 'uuid';
import type { ChampionshipsRepository, ChampionshipPatch, ChampionshipCreateInput } from '../ChampionshipsRepository';
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

  async create(input: ChampionshipCreateInput): Promise<Championship> {
    const now = new Date().toISOString();
    const { name, type, currentChampion, imageUrl, divisionId, ...rest } = input;
    const item: Record<string, unknown> = {
      championshipId: uuidv4(),
      name,
      type,
      ...(currentChampion !== undefined ? { currentChampion } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(divisionId !== undefined ? { divisionId } : {}),
      ...rest,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.CHAMPIONSHIPS, Item: item });
    return item as unknown as Championship;
  }

  async delete(championshipId: string): Promise<void> {
    await dynamoDb.delete({ TableName: TableNames.CHAMPIONSHIPS, Key: { championshipId } });
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

  async update(championshipId: string, patch: ChampionshipPatch): Promise<Championship> {
    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
      buildUpdateExpression(patch, new Date().toISOString());
    try {
      const result = await dynamoDb.update({
        TableName: TableNames.CHAMPIONSHIPS,
        Key: { championshipId },
        UpdateExpression,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(championshipId)',
        ReturnValues: 'ALL_NEW',
      });
      return result.Attributes as Championship;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ConditionalCheckFailedException') {
        throw new NotFoundError('Championship', championshipId);
      }
      throw err;
    }
  }

  async removeChampion(championshipId: string): Promise<Championship> {
    const result = await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIPS,
      Key: { championshipId },
      UpdateExpression: 'REMOVE currentChampion SET updatedAt = :now, version = if_not_exists(version, :zero) + :one',
      ExpressionAttributeValues: { ':now': new Date().toISOString(), ':zero': 0, ':one': 1 },
      ReturnValues: 'ALL_NEW',
    });
    return result.Attributes as Championship;
  }

  async closeReign(championshipId: string, wonDate: string, lostDate: string, daysHeld: number): Promise<void> {
    await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      Key: { championshipId, wonDate },
      UpdateExpression: 'SET lostDate = :lostDate, daysHeld = :daysHeld',
      ExpressionAttributeValues: { ':lostDate': lostDate, ':daysHeld': daysHeld },
    });
  }

  async reopenReign(championshipId: string, wonDate: string): Promise<void> {
    await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      Key: { championshipId, wonDate },
      UpdateExpression: 'REMOVE lostDate, daysHeld SET updatedAt = :now',
      ExpressionAttributeValues: { ':now': new Date().toISOString() },
    });
  }

  async deleteHistoryEntry(championshipId: string, wonDate: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      Key: { championshipId, wonDate },
    });
  }

  async incrementDefenses(championshipId: string, wonDate: string): Promise<void> {
    await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      Key: { championshipId, wonDate },
      UpdateExpression: 'SET defenses = if_not_exists(defenses, :zero) + :one, updatedAt = :now',
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':now': new Date().toISOString() },
    });
  }

  async decrementDefenses(championshipId: string, wonDate: string): Promise<void> {
    await dynamoDb.update({
      TableName: TableNames.CHAMPIONSHIP_HISTORY,
      Key: { championshipId, wonDate },
      UpdateExpression: 'SET defenses = defenses - :one, updatedAt = :now',
      ExpressionAttributeValues: { ':one': 1, ':now': new Date().toISOString() },
    });
  }
}
