import { v4 as uuidv4 } from 'uuid';
import { dynamoDb } from '../../dynamodb';
import { NotFoundError } from '../errors';
import { buildUpdateExpression } from './util';
import type { CrudRepository } from '../CrudRepository';

export interface DynamoCrudConfig<T, TCreate> {
  tableName: string;
  idField: keyof T & string;
  entityName: string;
  buildItem: (input: TCreate, id: string, now: string) => T;
}

export class DynamoCrudRepository<T, TCreate, TPatch extends object>
  implements CrudRepository<T, TCreate, TPatch>
{
  constructor(private config: DynamoCrudConfig<T, TCreate>) {}

  async findById(id: string): Promise<T | null> {
    const result = await dynamoDb.get({
      TableName: this.config.tableName,
      Key: { [this.config.idField]: id },
    });
    return (result.Item as T | undefined) ?? null;
  }

  async list(): Promise<T[]> {
    const result = await dynamoDb.scan({ TableName: this.config.tableName });
    return (result.Items ?? []) as T[];
  }

  async create(input: TCreate): Promise<T> {
    const now = new Date().toISOString();
    const item = this.config.buildItem(input, uuidv4(), now);
    await dynamoDb.put({
      TableName: this.config.tableName,
      Item: item as Record<string, unknown>,
    });
    return item;
  }

  async update(id: string, patch: TPatch): Promise<T> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb.update({
      TableName: this.config.tableName,
      Key: { [this.config.idField]: id },
      UpdateExpression: expr.UpdateExpression,
      ExpressionAttributeNames: expr.ExpressionAttributeNames,
      ExpressionAttributeValues: expr.ExpressionAttributeValues,
      ConditionExpression: `attribute_exists(${this.config.idField})`,
      ReturnValues: 'ALL_NEW',
    }).catch((err: { name?: string }) => {
      if (err.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError(this.config.entityName, id);
      }
      throw err;
    });
    return result.Attributes as T;
  }

  async delete(id: string): Promise<void> {
    await dynamoDb.delete({
      TableName: this.config.tableName,
      Key: { [this.config.idField]: id },
    });
  }
}
