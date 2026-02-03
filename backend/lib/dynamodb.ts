import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
  GetCommandInput,
  PutCommandInput,
  UpdateCommandInput,
  DeleteCommandInput,
  ScanCommandInput,
  QueryCommandInput,
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
};

export const TableNames = {
  PLAYERS: process.env.PLAYERS_TABLE!,
  MATCHES: process.env.MATCHES_TABLE!,
  CHAMPIONSHIPS: process.env.CHAMPIONSHIPS_TABLE!,
  CHAMPIONSHIP_HISTORY: process.env.CHAMPIONSHIP_HISTORY_TABLE!,
  TOURNAMENTS: process.env.TOURNAMENTS_TABLE!,
  SEASONS: process.env.SEASONS_TABLE!,
  SEASON_STANDINGS: process.env.SEASON_STANDINGS_TABLE!,
};
