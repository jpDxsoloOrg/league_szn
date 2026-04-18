import { dynamoDb, TableNames } from '../../dynamodb';
import type {
  OverallSubmitInput,
  OverallsRepository,
} from '../OverallsRepository';
import type { WrestlerOverall } from '../types';

export class DynamoOverallsRepository implements OverallsRepository {
  async findByPlayerId(playerId: string): Promise<WrestlerOverall | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.WRESTLER_OVERALLS,
      Key: { playerId },
    });
    return (result.Item as WrestlerOverall | undefined) ?? null;
  }

  async listAll(): Promise<WrestlerOverall[]> {
    const items = await dynamoDb.scanAll({ TableName: TableNames.WRESTLER_OVERALLS });
    return items as unknown as WrestlerOverall[];
  }

  async submit(input: OverallSubmitInput): Promise<WrestlerOverall> {
    // Preserve original submittedAt if record already exists
    const existing = await this.findByPlayerId(input.playerId);
    const now = new Date().toISOString();

    const item: WrestlerOverall = {
      playerId: input.playerId,
      mainOverall: input.mainOverall,
      updatedAt: now,
      submittedAt: existing?.submittedAt ?? now,
    };

    if (input.alternateOverall !== undefined) {
      item.alternateOverall = input.alternateOverall;
    }

    await dynamoDb.put({
      TableName: TableNames.WRESTLER_OVERALLS,
      Item: item,
    });

    return item;
  }
}
