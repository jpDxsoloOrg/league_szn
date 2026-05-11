import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import {
  buildThreadKey,
  type FactionDirectMessage,
  type FactionDirectMessagePostInput,
  type FactionDirectMessagesRepository,
  type FactionDirectThreadSummary,
  type FactionMessage,
  type FactionMessagePostInput,
  type FactionMessagesRepository,
  type ListPage,
  type ListPageOptions,
} from '../factionMessages';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const encodeCursor = (key: Record<string, unknown> | undefined): string | undefined =>
  key ? Buffer.from(JSON.stringify(key)).toString('base64') : undefined;

const decodeCursor = (cursor: string | undefined): Record<string, unknown> | undefined => {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid pagination cursor');
  }
};

const clampLimit = (n: number | undefined): number => {
  if (!n || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
};

const buildSortKey = (createdAt: string, messageId: string): string =>
  `${createdAt}#${messageId}`;

interface ChannelItem {
  factionId: string;
  createdAtMessageId: string;
  messageId: string;
  authorPlayerId: string;
  body: string;
  messageType: 'user' | 'system';
  createdAt: string;
}

interface DirectItem {
  factionThreadKey: string;
  createdAtMessageId: string;
  factionId: string;
  threadKey: string;
  messageId: string;
  senderPlayerId: string;
  recipientPlayerId: string;
  body: string;
  createdAt: string;
}

const toChannelDomain = (item: ChannelItem): FactionMessage => ({
  messageId: item.messageId,
  factionId: item.factionId,
  authorPlayerId: item.authorPlayerId,
  body: item.body,
  messageType: item.messageType,
  createdAt: item.createdAt,
});

const toDirectDomain = (item: DirectItem): FactionDirectMessage => ({
  messageId: item.messageId,
  factionId: item.factionId,
  threadKey: item.threadKey,
  senderPlayerId: item.senderPlayerId,
  recipientPlayerId: item.recipientPlayerId,
  body: item.body,
  createdAt: item.createdAt,
});

export class DynamoFactionMessagesRepository implements FactionMessagesRepository {
  async list(
    factionId: string,
    opts: ListPageOptions = {},
  ): Promise<ListPage<FactionMessage>> {
    const result = await dynamoDb.query({
      TableName: TableNames.FACTION_MESSAGES,
      KeyConditionExpression: '#f = :factionId',
      ExpressionAttributeNames: { '#f': 'factionId' },
      ExpressionAttributeValues: { ':factionId': factionId },
      ScanIndexForward: false, // newest first
      Limit: clampLimit(opts.limit),
      ExclusiveStartKey: decodeCursor(opts.cursor),
    });

    const items = (result.Items ?? []) as ChannelItem[];
    return {
      items: items.map(toChannelDomain),
      nextCursor: encodeCursor(result.LastEvaluatedKey),
    };
  }

  async post(input: FactionMessagePostInput): Promise<FactionMessage> {
    const messageId = uuidv4();
    const createdAt = new Date().toISOString();
    const item: ChannelItem = {
      factionId: input.factionId,
      createdAtMessageId: buildSortKey(createdAt, messageId),
      messageId,
      authorPlayerId: input.authorPlayerId,
      body: input.body,
      messageType: input.messageType ?? 'user',
      createdAt,
    };
    await dynamoDb.put({
      TableName: TableNames.FACTION_MESSAGES,
      Item: item,
    });
    return toChannelDomain(item);
  }
}

export class DynamoFactionDirectMessagesRepository implements FactionDirectMessagesRepository {
  async listThread(
    factionId: string,
    threadKey: string,
    opts: ListPageOptions = {},
  ): Promise<ListPage<FactionDirectMessage>> {
    const result = await dynamoDb.query({
      TableName: TableNames.FACTION_DIRECT_MESSAGES,
      KeyConditionExpression: '#pk = :pk',
      ExpressionAttributeNames: { '#pk': 'factionThreadKey' },
      ExpressionAttributeValues: { ':pk': `${factionId}#${threadKey}` },
      ScanIndexForward: false,
      Limit: clampLimit(opts.limit),
      ExclusiveStartKey: decodeCursor(opts.cursor),
    });

    const items = (result.Items ?? []) as DirectItem[];
    return {
      items: items.map(toDirectDomain),
      nextCursor: encodeCursor(result.LastEvaluatedKey),
    };
  }

  async post(input: FactionDirectMessagePostInput): Promise<FactionDirectMessage> {
    const messageId = uuidv4();
    const createdAt = new Date().toISOString();
    const threadKey = buildThreadKey(input.senderPlayerId, input.recipientPlayerId);
    const item: DirectItem = {
      factionThreadKey: `${input.factionId}#${threadKey}`,
      createdAtMessageId: buildSortKey(createdAt, messageId),
      factionId: input.factionId,
      threadKey,
      messageId,
      senderPlayerId: input.senderPlayerId,
      recipientPlayerId: input.recipientPlayerId,
      body: input.body,
      createdAt,
    };
    await dynamoDb.put({
      TableName: TableNames.FACTION_DIRECT_MESSAGES,
      Item: item,
    });
    return toDirectDomain(item);
  }

  async listThreadsForPlayer(
    factionId: string,
    playerId: string,
  ): Promise<FactionDirectThreadSummary[]> {
    // The player is on either side of every thread they're in, so we have to
    // query both GSIs and merge by threadKey. Each GSI item duplicates the
    // base table's attributes (ProjectionType: ALL).
    const [asSender, asRecipient] = await Promise.all([
      dynamoDb.queryAll({
        TableName: TableNames.FACTION_DIRECT_MESSAGES,
        IndexName: 'FactionSenderIndex',
        KeyConditionExpression: '#f = :f AND #p = :p',
        ExpressionAttributeNames: { '#f': 'factionId', '#p': 'senderPlayerId' },
        ExpressionAttributeValues: { ':f': factionId, ':p': playerId },
      }),
      dynamoDb.queryAll({
        TableName: TableNames.FACTION_DIRECT_MESSAGES,
        IndexName: 'FactionRecipientIndex',
        KeyConditionExpression: '#f = :f AND #p = :p',
        ExpressionAttributeNames: { '#f': 'factionId', '#p': 'recipientPlayerId' },
        ExpressionAttributeValues: { ':f': factionId, ':p': playerId },
      }),
    ]);

    const all = [...asSender, ...asRecipient] as unknown as DirectItem[];

    // Reduce to one summary per threadKey (newest message wins).
    const byThread = new Map<string, FactionDirectMessage>();
    for (const item of all) {
      const domain = toDirectDomain(item);
      const existing = byThread.get(domain.threadKey);
      if (!existing || domain.createdAt > existing.createdAt) {
        byThread.set(domain.threadKey, domain);
      }
    }

    return Array.from(byThread.values())
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((lastMessage) => ({
        threadKey: lastMessage.threadKey,
        partnerPlayerId:
          lastMessage.senderPlayerId === playerId
            ? lastMessage.recipientPlayerId
            : lastMessage.senderPlayerId,
        lastMessage,
        // Read-receipts arrive in a later ticket; v1 returns 0.
        unreadCount: 0,
      }));
  }
}
