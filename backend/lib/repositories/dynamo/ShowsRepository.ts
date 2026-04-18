import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  ShowCreateInput,
  ShowPatch,
  ShowsRepository,
} from '../ShowsRepository';
import type { Show } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoShowsRepository implements ShowsRepository {
  async findById(showId: string): Promise<Show | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.SHOWS,
      Key: { showId },
    });
    return (result.Item as Show | undefined) ?? null;
  }

  async list(): Promise<Show[]> {
    const result = await dynamoDb.scan({ TableName: TableNames.SHOWS });
    const shows = (result.Items || []) as unknown as Show[];
    shows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return shows;
  }

  async listByCompany(companyId: string): Promise<Show[]> {
    const result = await dynamoDb.query({
      TableName: TableNames.SHOWS,
      IndexName: 'CompanyShowsIndex',
      KeyConditionExpression: '#companyId = :companyId',
      ExpressionAttributeNames: { '#companyId': 'companyId' },
      ExpressionAttributeValues: { ':companyId': companyId },
    });
    const shows = (result.Items || []) as unknown as Show[];
    shows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return shows;
  }

  async create(input: ShowCreateInput): Promise<Show> {
    const now = new Date().toISOString();
    const item: Show = {
      showId: uuidv4(),
      name: input.name,
      companyId: input.companyId,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.schedule !== undefined ? { schedule: input.schedule } : {}),
      ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.SHOWS, Item: item });
    return item;
  }

  async update(showId: string, patch: ShowPatch): Promise<Show> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb.update({
      TableName: TableNames.SHOWS,
      Key: { showId },
      UpdateExpression: expr.UpdateExpression,
      ExpressionAttributeNames: expr.ExpressionAttributeNames,
      ExpressionAttributeValues: expr.ExpressionAttributeValues,
      ConditionExpression: 'attribute_exists(showId)',
      ReturnValues: 'ALL_NEW',
    }).catch((err: { name?: string }) => {
      if (err.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError('Show', showId);
      }
      throw err;
    });
    return result.Attributes as Show;
  }

  async delete(showId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.SHOWS,
      Key: { showId },
    });
  }
}
