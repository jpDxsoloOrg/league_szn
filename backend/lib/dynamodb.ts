import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
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
import { notFound } from './response';

const isOffline = process.env.IS_OFFLINE === 'true';
const offlineDynamoDbEndpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';

const client = new DynamoDBClient(
  isOffline
    ? {
        region: 'us-east-1',
        endpoint: offlineDynamoDbEndpoint,
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
  CONTENDER_OVERRIDES: process.env.CONTENDER_OVERRIDES_TABLE!,
  FANTASY_CONFIG: process.env.FANTASY_CONFIG_TABLE!,
  WRESTLER_COSTS: process.env.WRESTLER_COSTS_TABLE!,
  FANTASY_PICKS: process.env.FANTASY_PICKS_TABLE!,
  SITE_CONFIG: process.env.SITE_CONFIG_TABLE!,
  CHALLENGES: process.env.CHALLENGES_TABLE!,
  PROMOS: process.env.PROMOS_TABLE!,
  STIPULATIONS: process.env.STIPULATIONS_TABLE!,
  MATCH_TYPES: process.env.MATCH_TYPES_TABLE!,
  SEASON_AWARDS: process.env.SEASON_AWARDS_TABLE!,
  COMPANIES: process.env.COMPANIES_TABLE!,
  SHOWS: process.env.SHOWS_TABLE!,
  STABLES: process.env.STABLES_TABLE!,
  TAG_TEAMS: process.env.TAG_TEAMS_TABLE!,
  STABLE_INVITATIONS: process.env.STABLE_INVITATIONS_TABLE!,
  VIDEOS: process.env.VIDEOS_TABLE!,
  ANNOUNCEMENTS: process.env.ANNOUNCEMENTS_TABLE!,
  NOTIFICATIONS: process.env.NOTIFICATIONS_TABLE!,
  WRESTLER_OVERALLS: process.env.WRESTLER_OVERALLS_TABLE!,
  TRANSFER_REQUESTS: process.env.TRANSFER_REQUESTS_TABLE!,
};

type DynamoRecord = Record<string, unknown>;

interface GetOrNotFoundSuccess<TItem> {
  item: TItem;
}

interface GetOrNotFoundFailure {
  notFoundResponse: APIGatewayProxyResult;
}

export async function getOrNotFound<TItem extends DynamoRecord = DynamoRecord>(
  tableName: string,
  key: DynamoRecord,
  notFoundMessage: string
): Promise<GetOrNotFoundSuccess<TItem> | GetOrNotFoundFailure> {
  const result = await dynamoDb.get({
    TableName: tableName,
    Key: key,
  });

  if (!result.Item) {
    return { notFoundResponse: notFound(notFoundMessage) };
  }

  return { item: result.Item as TItem };
}

export interface BuildUpdateExpressionOptions {
  includeUpdatedAt?: boolean;
  updatedAtFieldName?: string;
  updatedAtValue?: string;
  removeFields?: string[];
}

export interface BuildUpdateExpressionResult {
  UpdateExpression: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
  hasChanges: boolean;
}

const toNameToken = (field: string): string => `#${field.replace(/[^a-zA-Z0-9_]/g, '_')}`;
const toValueToken = (field: string): string => `:${field.replace(/[^a-zA-Z0-9_]/g, '_')}`;

export function buildUpdateExpression(
  fields: Record<string, unknown>,
  options: BuildUpdateExpressionOptions = {}
): BuildUpdateExpressionResult {
  const {
    includeUpdatedAt = true,
    updatedAtFieldName = 'updatedAt',
    updatedAtValue = new Date().toISOString(),
    removeFields = [],
  } = options;

  const setExpressions: string[] = [];
  const removeExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  let hasChanges = false;

  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }

    const nameToken = toNameToken(field);
    const valueToken = toValueToken(field);

    setExpressions.push(`${nameToken} = ${valueToken}`);
    expressionAttributeNames[nameToken] = field;
    expressionAttributeValues[valueToken] = value;
    hasChanges = true;
  }

  for (const field of removeFields) {
    const nameToken = toNameToken(field);
    removeExpressions.push(nameToken);
    expressionAttributeNames[nameToken] = field;
    hasChanges = true;
  }

  if (includeUpdatedAt) {
    const updatedAtNameToken = toNameToken(updatedAtFieldName);
    const updatedAtValueToken = toValueToken(updatedAtFieldName);
    setExpressions.push(`${updatedAtNameToken} = ${updatedAtValueToken}`);
    expressionAttributeNames[updatedAtNameToken] = updatedAtFieldName;
    expressionAttributeValues[updatedAtValueToken] = updatedAtValue;
  }

  let updateExpression = '';
  if (setExpressions.length > 0) {
    updateExpression = `SET ${setExpressions.join(', ')}`;
  }

  if (removeExpressions.length > 0) {
    updateExpression = updateExpression
      ? `${updateExpression} REMOVE ${removeExpressions.join(', ')}`
      : `REMOVE ${removeExpressions.join(', ')}`;
  }

  return {
    UpdateExpression: updateExpression,
    ExpressionAttributeNames:
      Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
    ExpressionAttributeValues:
      Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
    hasChanges,
  };
}
