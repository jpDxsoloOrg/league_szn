import { dynamoDb, TableNames } from '../../dynamodb';
import {
  clampLedgerPageSize,
  type LedgerEntry,
  type LedgerIdempotencyRecord,
  type LedgerPage,
  type LedgerRepository,
} from '../ledger';

export const LEDGER_ENTRY_ID_INDEX = 'EntryIdIndex';

const encodeCursor = (key: Record<string, unknown> | undefined): string | undefined =>
  key ? Buffer.from(JSON.stringify(key)).toString('base64') : undefined;

/** The cursor must be a key in this player's partition, so it can't start a read in another player's rows. */
const decodeCursor = (cursor: string | undefined, playerId: string): Record<string, unknown> | undefined => {
  if (!cursor) return undefined;
  let key: unknown;
  try {
    key = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
  } catch {
    throw new Error('Invalid pagination cursor');
  }
  const candidate = key as { playerId?: unknown; sortKey?: unknown } | null;
  if (!candidate || candidate.playerId !== playerId || typeof candidate.sortKey !== 'string') {
    throw new Error('Invalid pagination cursor');
  }
  return { playerId, sortKey: candidate.sortKey };
};

export class DynamoLedgerRepository implements LedgerRepository {
  async listForPlayer(playerId: string, cursor?: string, limit?: number): Promise<LedgerPage> {
    const result = await dynamoDb.query({
      TableName: TableNames.LEDGER,
      KeyConditionExpression: 'playerId = :playerId',
      ExpressionAttributeValues: { ':playerId': playerId },
      ScanIndexForward: false,
      Limit: clampLedgerPageSize(limit),
      ExclusiveStartKey: decodeCursor(cursor, playerId),
    });
    const nextCursor = encodeCursor(result.LastEvaluatedKey);
    return {
      items: (result.Items ?? []) as LedgerEntry[],
      ...(nextCursor && { nextCursor }),
    };
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<LedgerEntry | null> {
    const marker = await dynamoDb.get({
      TableName: TableNames.LEDGER_IDEMPOTENCY,
      Key: { idempotencyKey },
    });
    const record = marker.Item as LedgerIdempotencyRecord | undefined;
    if (!record) return null;
    const entry = await dynamoDb.get({
      TableName: TableNames.LEDGER,
      Key: { playerId: record.playerId, sortKey: record.sortKey },
    });
    return (entry.Item as LedgerEntry | undefined) ?? null;
  }

  async getByEntryId(entryId: string): Promise<LedgerEntry | null> {
    const result = await dynamoDb.query({
      TableName: TableNames.LEDGER,
      IndexName: LEDGER_ENTRY_ID_INDEX,
      KeyConditionExpression: 'entryId = :entryId',
      ExpressionAttributeValues: { ':entryId': entryId },
      Limit: 1,
    });
    return ((result.Items ?? [])[0] as LedgerEntry | undefined) ?? null;
  }
}
