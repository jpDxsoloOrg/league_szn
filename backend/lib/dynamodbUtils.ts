import { APIGatewayProxyResult } from 'aws-lambda';
import { notFound } from './response';
import { dynamoDb } from './dynamodb';

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
