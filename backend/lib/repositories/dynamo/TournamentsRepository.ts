import { dynamoDb, TableNames } from '../../dynamodb';
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
}
