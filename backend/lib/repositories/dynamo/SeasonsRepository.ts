import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  SeasonCreateInput,
  SeasonPatch,
  SeasonsRepository,
} from '../SeasonsRepository';
import type { Season } from '../types';

export class DynamoSeasonsRepository implements SeasonsRepository {
  async findById(seasonId: string): Promise<Season | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.SEASONS,
      Key: { seasonId },
    });
    return (result.Item as Season | undefined) ?? null;
  }

  async list(): Promise<Season[]> {
    const result = await dynamoDb.scan({ TableName: TableNames.SEASONS });
    const seasons = (result.Items || []) as unknown as Season[];
    seasons.sort((a, b) =>
      new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );
    return seasons;
  }

  async findActive(): Promise<Season | null> {
    const result = await dynamoDb.scan({
      TableName: TableNames.SEASONS,
      FilterExpression: '#status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':active': 'active' },
    });
    return ((result.Items?.[0]) as Season | undefined) ?? null;
  }

  async create(input: SeasonCreateInput): Promise<Season> {
    const now = new Date().toISOString();
    const item: Season = {
      seasonId: uuidv4(),
      name: input.name,
      startDate: input.startDate,
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.SEASONS, Item: item });
    return item;
  }

  async update(seasonId: string, patch: SeasonPatch): Promise<Season> {
    const existing = await this.findById(seasonId);
    if (!existing) throw new NotFoundError('Season', seasonId);

    const now = new Date().toISOString();
    const setExpressions: string[] = [];
    const expressionAttributeValues: Record<string, unknown> = {
      ':updatedAt': now,
    };
    const expressionAttributeNames: Record<string, string> = {};

    if (patch.name !== undefined) {
      setExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = patch.name;
    }

    if (patch.status !== undefined) {
      setExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = patch.status;
    }

    if (patch.endDate !== undefined) {
      setExpressions.push('endDate = :endDate');
      expressionAttributeValues[':endDate'] = patch.endDate;
    }

    // If ending season, auto-set endDate if not provided
    if (patch.status === 'completed' && !patch.endDate && !existing.endDate) {
      setExpressions.push('endDate = :autoEndDate');
      expressionAttributeValues[':autoEndDate'] = now;
    }

    setExpressions.push('updatedAt = :updatedAt');

    const result = await dynamoDb.update({
      TableName: TableNames.SEASONS,
      Key: { seasonId },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0
        ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return result.Attributes as Season;
  }

  async delete(seasonId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.SEASONS,
      Key: { seasonId },
    });
  }
}
