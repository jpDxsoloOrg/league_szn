import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  DivisionCreateInput,
  DivisionPatch,
  DivisionsRepository,
} from '../DivisionsRepository';
import type { Division } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoDivisionsRepository implements DivisionsRepository {
  async findById(divisionId: string): Promise<Division | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.DIVISIONS,
      Key: { divisionId },
    });
    return (result.Item as Division | undefined) ?? null;
  }

  async list(): Promise<Division[]> {
    const result = await dynamoDb.scan({ TableName: TableNames.DIVISIONS });
    return (result.Items ?? []) as Division[];
  }

  async create(input: DivisionCreateInput): Promise<Division> {
    const now = new Date().toISOString();
    const item: Division = {
      divisionId: uuidv4(),
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.DIVISIONS, Item: item });
    return item;
  }

  async update(divisionId: string, patch: DivisionPatch): Promise<Division> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb.update({
      TableName: TableNames.DIVISIONS,
      Key: { divisionId },
      UpdateExpression: expr.UpdateExpression,
      ExpressionAttributeNames: expr.ExpressionAttributeNames,
      ExpressionAttributeValues: expr.ExpressionAttributeValues,
      ConditionExpression: 'attribute_exists(divisionId)',
      ReturnValues: 'ALL_NEW',
    }).catch((err: { name?: string }) => {
      if (err.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError('Division', divisionId);
      }
      throw err;
    });
    return result.Attributes as Division;
  }

  async delete(divisionId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.DIVISIONS,
      Key: { divisionId },
    });
  }
}
