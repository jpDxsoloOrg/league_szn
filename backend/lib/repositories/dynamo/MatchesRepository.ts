import { dynamoDb, TableNames } from '../../dynamodb';
import type { MatchesRepository } from '../MatchesRepository';
import type { Match } from '../types';

export class DynamoMatchesRepository implements MatchesRepository {
  async findById(matchId: string): Promise<Match | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.MATCHES,
      Key: { matchId },
    });
    return (result.Item as Match | undefined) ?? null;
  }

  async list(): Promise<Match[]> {
    return await dynamoDb.scanAll({ TableName: TableNames.MATCHES }) as unknown as Match[];
  }

  async listCompleted(): Promise<Match[]> {
    return await dynamoDb.scanAll({
      TableName: TableNames.MATCHES,
      FilterExpression: '#status = :completed',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':completed': 'completed' },
    }) as unknown as Match[];
  }

  async listByStatus(status: string): Promise<Match[]> {
    return await dynamoDb.scanAll({
      TableName: TableNames.MATCHES,
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
    }) as unknown as Match[];
  }

  async listByTournament(tournamentId: string): Promise<Match[]> {
    return await dynamoDb.queryAll({
      TableName: TableNames.MATCHES,
      IndexName: 'TournamentIndex',
      KeyConditionExpression: 'tournamentId = :tournamentId',
      ExpressionAttributeValues: { ':tournamentId': tournamentId },
    }) as unknown as Match[];
  }

  async listBySeason(seasonId: string): Promise<Match[]> {
    return await dynamoDb.scanAll({
      TableName: TableNames.MATCHES,
      FilterExpression: 'seasonId = :seasonId',
      ExpressionAttributeValues: { ':seasonId': seasonId },
    }) as unknown as Match[];
  }
}
