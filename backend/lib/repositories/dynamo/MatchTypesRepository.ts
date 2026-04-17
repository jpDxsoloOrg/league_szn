import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  MatchTypeCreateInput,
  MatchTypePatch,
  MatchTypesRepository,
} from '../MatchTypesRepository';
import type { MatchType } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoMatchTypesRepository implements MatchTypesRepository {
  async findById(matchTypeId: string): Promise<MatchType | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.MATCH_TYPES,
      Key: { matchTypeId },
    });
    return (result.Item as MatchType | undefined) ?? null;
  }

  async list(): Promise<MatchType[]> {
    const result = await dynamoDb.scan({ TableName: TableNames.MATCH_TYPES });
    return (result.Items ?? []) as MatchType[];
  }

  async create(input: MatchTypeCreateInput): Promise<MatchType> {
    const now = new Date().toISOString();
    const item: MatchType = {
      matchTypeId: uuidv4(),
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.MATCH_TYPES, Item: item });
    return item;
  }

  async update(matchTypeId: string, patch: MatchTypePatch): Promise<MatchType> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb.update({
      TableName: TableNames.MATCH_TYPES,
      Key: { matchTypeId },
      UpdateExpression: expr.UpdateExpression,
      ExpressionAttributeNames: expr.ExpressionAttributeNames,
      ExpressionAttributeValues: expr.ExpressionAttributeValues,
      ConditionExpression: 'attribute_exists(matchTypeId)',
      ReturnValues: 'ALL_NEW',
    }).catch((err: { name?: string }) => {
      if (err.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError('MatchType', matchTypeId);
      }
      throw err;
    });
    return result.Attributes as MatchType;
  }

  async delete(matchTypeId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.MATCH_TYPES,
      Key: { matchTypeId },
    });
  }
}
