import { dynamoDb, TableNames } from '../../dynamodb';
import type {
  GmInterferenceListFilter,
  GmInterferenceRepository,
  GmInterferenceRequest,
} from '../gmInterference';

const newestFirst = (a: GmInterferenceRequest, b: GmInterferenceRequest): number =>
  b.createdAt.localeCompare(a.createdAt);

/** ECO-09: reads only. Writes go through the unit of work with the money. */
export class DynamoGmInterferenceRepository implements GmInterferenceRepository {
  async findById(requestId: string): Promise<GmInterferenceRequest | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.GM_INTERFERENCE,
      Key: { requestId },
      ConsistentRead: true,
    });
    return (result.Item as GmInterferenceRequest | undefined) ?? null;
  }

  async listByPlayer(playerId: string): Promise<GmInterferenceRequest[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.GM_INTERFERENCE,
      IndexName: 'PlayerIndex',
      KeyConditionExpression: '#playerId = :playerId',
      ExpressionAttributeNames: { '#playerId': 'playerId' },
      ExpressionAttributeValues: { ':playerId': playerId },
      ScanIndexForward: false,
    });
    return items as unknown as GmInterferenceRequest[];
  }

  async list(filter: GmInterferenceListFilter = {}): Promise<GmInterferenceRequest[]> {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.GM_INTERFERENCE,
      ...(filter.status !== undefined && {
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': filter.status },
      }),
    });
    return (items as unknown as GmInterferenceRequest[]).sort(newestFirst);
  }
}
