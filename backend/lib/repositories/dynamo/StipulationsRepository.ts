import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  StipulationCreateInput,
  StipulationPatch,
  StipulationsRepository,
} from '../StipulationsRepository';
import type { Stipulation } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoStipulationsRepository implements StipulationsRepository {
  async findById(stipulationId: string): Promise<Stipulation | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.STIPULATIONS,
      Key: { stipulationId },
    });
    return (result.Item as Stipulation | undefined) ?? null;
  }

  async list(): Promise<Stipulation[]> {
    const result = await dynamoDb.scan({ TableName: TableNames.STIPULATIONS });
    return (result.Items ?? []) as Stipulation[];
  }

  async create(input: StipulationCreateInput): Promise<Stipulation> {
    const now = new Date().toISOString();
    const item: Stipulation = {
      stipulationId: uuidv4(),
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.STIPULATIONS, Item: item });
    return item;
  }

  async update(stipulationId: string, patch: StipulationPatch): Promise<Stipulation> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb.update({
      TableName: TableNames.STIPULATIONS,
      Key: { stipulationId },
      UpdateExpression: expr.UpdateExpression,
      ExpressionAttributeNames: expr.ExpressionAttributeNames,
      ExpressionAttributeValues: expr.ExpressionAttributeValues,
      ConditionExpression: 'attribute_exists(stipulationId)',
      ReturnValues: 'ALL_NEW',
    }).catch((err: { name?: string }) => {
      if (err.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError('Stipulation', stipulationId);
      }
      throw err;
    });
    return result.Attributes as Stipulation;
  }

  async delete(stipulationId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.STIPULATIONS,
      Key: { stipulationId },
    });
  }
}
