import { dynamoDb, TableNames } from '../../dynamodb';
import { buildUpdateExpression } from './util';
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

  async findByIdWithDate(matchId: string): Promise<(Match & { date: string }) | null> {
    const result = await dynamoDb.query({
      TableName: TableNames.MATCHES,
      KeyConditionExpression: 'matchId = :matchId',
      ExpressionAttributeValues: { ':matchId': matchId },
      Limit: 1,
    });
    return ((result.Items?.[0]) as (Match & { date: string }) | undefined) ?? null;
  }

  async create(input: Record<string, unknown>): Promise<Match> {
    await dynamoDb.put({
      TableName: TableNames.MATCHES,
      Item: input,
    });
    return input as unknown as Match;
  }

  async update(matchId: string, date: string, patch: Record<string, unknown>): Promise<Match> {
    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
      buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb.update({
      TableName: TableNames.MATCHES,
      Key: { matchId, date },
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });
    return result.Attributes as Match;
  }

  async delete(matchId: string, date: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.MATCHES,
      Key: { matchId, date },
    });
  }
}
