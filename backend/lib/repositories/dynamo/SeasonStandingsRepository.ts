import { dynamoDb, TableNames } from '../../dynamodb';
import type { SeasonStandingsRepository } from '../SeasonStandingsRepository';
import type { SeasonStanding } from '../types';

export class DynamoSeasonStandingsRepository implements SeasonStandingsRepository {
  async listBySeason(seasonId: string): Promise<SeasonStanding[]> {
    return await dynamoDb.queryAll({
      TableName: TableNames.SEASON_STANDINGS,
      KeyConditionExpression: 'seasonId = :seasonId',
      ExpressionAttributeValues: { ':seasonId': seasonId },
    }) as unknown as SeasonStanding[];
  }
}
