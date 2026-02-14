import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
  TransactWriteCommand,
  GetCommandInput,
  PutCommandInput,
  UpdateCommandInput,
  DeleteCommandInput,
  ScanCommandInput,
  QueryCommandInput,
  TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';

const isOffline = process.env.IS_OFFLINE === 'true';

const client = new DynamoDBClient(
  isOffline
    ? {
        region: 'us-east-1',
        endpoint: 'http://localhost:8000',
        credentials: {
          accessKeyId: 'dummy',
          secretAccessKey: 'dummy',
        },
      }
    : {}
);
export const docClient = DynamoDBDocumentClient.from(client);

export const dynamoDb = {
  get: async (params: GetCommandInput) => {
    const command = new GetCommand(params);
    return docClient.send(command);
  },

  put: async (params: PutCommandInput) => {
    const command = new PutCommand(params);
    return docClient.send(command);
  },

  update: async (params: UpdateCommandInput) => {
    const command = new UpdateCommand(params);
    return docClient.send(command);
  },

  delete: async (params: DeleteCommandInput) => {
    const command = new DeleteCommand(params);
    return docClient.send(command);
  },

  scan: async (params: ScanCommandInput) => {
    const command = new ScanCommand(params);
    return docClient.send(command);
  },

  query: async (params: QueryCommandInput) => {
    const command = new QueryCommand(params);
    return docClient.send(command);
  },

  transactWrite: async (params: TransactWriteCommandInput) => {
    const command = new TransactWriteCommand(params);
    return docClient.send(command);
  },

  /**
   * Scans all items from a table, handling pagination automatically.
   * Use this when you need to retrieve all items and the table may have >1MB of data.
   */
  scanAll: async (params: ScanCommandInput): Promise<Record<string, unknown>[]> => {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const command = new ScanCommand({
        ...params,
        ExclusiveStartKey: lastKey,
      });
      const result = await docClient.send(command);
      items.push(...((result.Items || []) as Record<string, unknown>[]));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items;
  },

  /**
   * Queries all items matching the condition, handling pagination automatically.
   * Use this when you need to retrieve all matching items and results may exceed 1MB.
   */
  queryAll: async (params: QueryCommandInput): Promise<Record<string, unknown>[]> => {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const command = new QueryCommand({
        ...params,
        ExclusiveStartKey: lastKey,
      });
      const result = await docClient.send(command);
      items.push(...((result.Items || []) as Record<string, unknown>[]));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items;
  },
};

export const TableNames = {
  PLAYERS: process.env.PLAYERS_TABLE!,
  MATCHES: process.env.MATCHES_TABLE!,
  CHAMPIONSHIPS: process.env.CHAMPIONSHIPS_TABLE!,
  CHAMPIONSHIP_HISTORY: process.env.CHAMPIONSHIP_HISTORY_TABLE!,
  TOURNAMENTS: process.env.TOURNAMENTS_TABLE!,
  SEASONS: process.env.SEASONS_TABLE!,
  SEASON_STANDINGS: process.env.SEASON_STANDINGS_TABLE!,
  DIVISIONS: process.env.DIVISIONS_TABLE!,
  EVENTS: process.env.EVENTS_TABLE!,
  CONTENDER_RANKINGS: process.env.CONTENDER_RANKINGS_TABLE!,
  RANKING_HISTORY: process.env.RANKING_HISTORY_TABLE!,
  FANTASY_CONFIG: process.env.FANTASY_CONFIG_TABLE!,
  WRESTLER_COSTS: process.env.WRESTLER_COSTS_TABLE!,
  FANTASY_PICKS: process.env.FANTASY_PICKS_TABLE!,
  SITE_CONFIG: process.env.SITE_CONFIG_TABLE!,
  CHALLENGES: process.env.CHALLENGES_TABLE!,
  PROMOS: process.env.PROMOS_TABLE!,
  STIPULATIONS: process.env.STIPULATIONS_TABLE!,
};
