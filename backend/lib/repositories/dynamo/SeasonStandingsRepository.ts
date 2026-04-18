import { dynamoDb, TableNames } from '../../dynamodb';
import type { SeasonStandingsRepository } from '../SeasonStandingsRepository';
import type { SeasonStanding } from '../types';
import type { RecordDelta } from '../unitOfWork';

export class DynamoSeasonStandingsRepository implements SeasonStandingsRepository {
  async listBySeason(seasonId: string): Promise<SeasonStanding[]> {
    return await dynamoDb.queryAll({
      TableName: TableNames.SEASON_STANDINGS,
      KeyConditionExpression: 'seasonId = :seasonId',
      ExpressionAttributeValues: { ':seasonId': seasonId },
    }) as unknown as SeasonStanding[];
  }

  async findStanding(seasonId: string, playerId: string): Promise<SeasonStanding | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.SEASON_STANDINGS,
      Key: { seasonId, playerId },
    });
    return (result.Item as SeasonStanding | undefined) ?? null;
  }

  async increment(seasonId: string, playerId: string, delta: RecordDelta): Promise<void> {
    const parts: string[] = [];
    const values: Record<string, unknown> = { ':timestamp': new Date().toISOString() };

    if (delta.wins) {
      parts.push('wins = if_not_exists(wins, :zero) + :dw');
      values[':dw'] = delta.wins;
      values[':zero'] = 0;
    }
    if (delta.losses) {
      parts.push('losses = if_not_exists(losses, :zero) + :dl');
      values[':dl'] = delta.losses;
      if (!values[':zero']) values[':zero'] = 0;
    }
    if (delta.draws) {
      parts.push('draws = if_not_exists(draws, :zero) + :dd');
      values[':dd'] = delta.draws;
      if (!values[':zero']) values[':zero'] = 0;
    }
    parts.push('updatedAt = :timestamp');

    await dynamoDb.update({
      TableName: TableNames.SEASON_STANDINGS,
      Key: { seasonId, playerId },
      UpdateExpression: `SET ${parts.join(', ')}`,
      ExpressionAttributeValues: values,
    });
  }

  async listByPlayer(playerId: string): Promise<SeasonStanding[]> {
    return await dynamoDb.queryAll({
      TableName: TableNames.SEASON_STANDINGS,
      IndexName: 'PlayerIndex',
      KeyConditionExpression: 'playerId = :pid',
      ExpressionAttributeValues: { ':pid': playerId },
    }) as unknown as SeasonStanding[];
  }

  async delete(seasonId: string, playerId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.SEASON_STANDINGS,
      Key: { seasonId, playerId },
    });
  }

  async deleteAllForSeason(seasonId: string): Promise<void> {
    const standings = await this.listBySeason(seasonId);
    for (const standing of standings) {
      await this.delete(seasonId, standing.playerId);
    }
  }
}
