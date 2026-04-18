import { dynamoDb, TableNames } from '../../dynamodb';
import { buildUpdateExpression } from './util';
import { NotFoundError } from '../errors';
import type { TournamentsRepository } from '../TournamentsRepository';
import type { Tournament } from '../types';

export class DynamoTournamentsRepository implements TournamentsRepository {
  async findById(tournamentId: string): Promise<Tournament | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.TOURNAMENTS,
      Key: { tournamentId },
    });
    return (result.Item as Tournament | undefined) ?? null;
  }

  async list(): Promise<Tournament[]> {
    return await dynamoDb.scanAll({ TableName: TableNames.TOURNAMENTS }) as unknown as Tournament[];
  }

  async create(input: Record<string, unknown>): Promise<Tournament> {
    await dynamoDb.put({
      TableName: TableNames.TOURNAMENTS,
      Item: input,
    });
    return input as unknown as Tournament;
  }

  async update(tournamentId: string, patch: Partial<Tournament>): Promise<Tournament> {
    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
      buildUpdateExpression(patch, new Date().toISOString());
    try {
      const result = await dynamoDb.update({
        TableName: TableNames.TOURNAMENTS,
        Key: { tournamentId },
        UpdateExpression,
        ExpressionAttributeNames,
        ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(tournamentId)',
        ReturnValues: 'ALL_NEW',
      });
      return result.Attributes as Tournament;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ConditionalCheckFailedException') {
        throw new NotFoundError('Tournament', tournamentId);
      }
      throw err;
    }
  }
}
