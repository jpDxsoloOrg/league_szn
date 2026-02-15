import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface BulkCreateMatchTypesBody {
  names: string[];
}

const MAX_BULK_CREATE = 50;

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody<BulkCreateMatchTypesBody>(event);
    if (parseError) return parseError;

    if (!body.names || !Array.isArray(body.names) || body.names.length === 0) {
      return badRequest('names array is required and must not be empty');
    }

    if (body.names.length > MAX_BULK_CREATE) {
      return badRequest(`Maximum ${MAX_BULK_CREATE} match types can be created at once`);
    }

    // Deduplicate and filter empty strings
    const uniqueNames = [...new Set(body.names.map(n => n.trim()).filter(n => n.length > 0))];

    if (uniqueNames.length === 0) {
      return badRequest('At least one non-empty name is required');
    }

    const timestamp = new Date().toISOString();
    const createdItems: Record<string, string>[] = [];

    for (const name of uniqueNames) {
      const matchType: Record<string, string> = {
        matchTypeId: uuidv4(),
        name,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await dynamoDb.put({
        TableName: TableNames.MATCH_TYPES,
        Item: matchType,
      });

      createdItems.push(matchType);
    }

    return created({ created: createdItems.length, matchTypes: createdItems });
  } catch (err) {
    console.error('Error bulk creating match types:', err);
    return serverError('Failed to bulk create match types');
  }
};
