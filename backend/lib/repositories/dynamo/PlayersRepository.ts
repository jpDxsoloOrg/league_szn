import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  PlayerCreateInput,
  PlayerPatch,
  PlayersRepository,
} from '../PlayersRepository';
import type { Player } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoPlayersRepository implements PlayersRepository {
  async findById(playerId: string): Promise<Player | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
    });
    return (result.Item as Player | undefined) ?? null;
  }

  async findByUserId(userId: string): Promise<Player | null> {
    const result = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    });
    if (!result.Items || result.Items.length === 0) {
      return null;
    }
    return result.Items[0] as Player;
  }

  async list(): Promise<Player[]> {
    const result = await dynamoDb.scan({ TableName: TableNames.PLAYERS });
    return (result.Items ?? []) as Player[];
  }

  async create(input: PlayerCreateInput): Promise<Player> {
    const now = new Date().toISOString();
    const item: Player = {
      playerId: uuidv4(),
      name: input.name,
      currentWrestler: input.currentWrestler,
      ...(input.alternateWrestler !== undefined ? { alternateWrestler: input.alternateWrestler } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.psnId !== undefined ? { psnId: input.psnId } : {}),
      ...(input.divisionId !== undefined ? { divisionId: input.divisionId } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.alignment !== undefined ? { alignment: input.alignment } : {}),
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.PLAYERS, Item: item });
    return item;
  }

  async update(playerId: string, patch: PlayerPatch): Promise<Player> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb.update({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
      UpdateExpression: expr.UpdateExpression,
      ExpressionAttributeNames: expr.ExpressionAttributeNames,
      ExpressionAttributeValues: expr.ExpressionAttributeValues,
      ConditionExpression: 'attribute_exists(playerId)',
      ReturnValues: 'ALL_NEW',
    }).catch((err: { name?: string }) => {
      if (err.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError('Player', playerId);
      }
      throw err;
    });
    return result.Attributes as Player;
  }

  async delete(playerId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.PLAYERS,
      Key: { playerId },
    });
  }
}
