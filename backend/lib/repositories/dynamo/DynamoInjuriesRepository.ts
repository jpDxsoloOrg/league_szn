import { dynamoDb, TableNames } from '../../dynamodb';
import type { InjuriesRepository, Injury } from '../injuries';

const soonestReturnFirst = (a: Injury, b: Injury): number => a.returnsAt.localeCompare(b.returnsAt);

/** INJ-03: reads only. Writes go through the unit of work with the player row. */
export class DynamoInjuriesRepository implements InjuriesRepository {
  async get(playerId: string, startedAt: string): Promise<Injury | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.INJURIES,
      Key: { playerId, startedAt },
      ConsistentRead: true,
    });
    return (result.Item as Injury | undefined) ?? null;
  }

  async findByInjuryId(playerId: string, injuryId: string): Promise<Injury | null> {
    const rows = await this.listByPlayer(playerId);
    return rows.find((row) => row.injuryId === injuryId) ?? null;
  }

  async listByPlayer(playerId: string): Promise<Injury[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.INJURIES,
      KeyConditionExpression: '#playerId = :playerId',
      ExpressionAttributeNames: { '#playerId': 'playerId' },
      ExpressionAttributeValues: { ':playerId': playerId },
      ScanIndexForward: false,
      ConsistentRead: true,
    });
    return items as unknown as Injury[];
  }

  async listOpen(): Promise<Injury[]> {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.INJURIES,
      FilterExpression: 'attribute_not_exists(#endedAt)',
      ExpressionAttributeNames: { '#endedAt': 'endedAt' },
    });
    return (items as unknown as Injury[]).sort(soonestReturnFirst);
  }
}
