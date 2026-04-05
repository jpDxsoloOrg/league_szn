import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface CreateTransferRequestBody {
  toDivisionId: string;
  reason: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    // Look up the player by userId
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': sub },
    });

    if (!playerResult.Items || playerResult.Items.length === 0) {
      return notFound('No player profile found for this user');
    }

    const player = playerResult.Items[0];
    const playerId = player.playerId as string;
    const fromDivisionId = player.divisionId as string | undefined;

    if (!fromDivisionId) {
      return badRequest('You are not currently assigned to a division');
    }

    const parsed = parseBody<CreateTransferRequestBody>(event);
    if (parsed.error) return parsed.error;
    const { toDivisionId, reason } = parsed.data;

    if (!toDivisionId || typeof toDivisionId !== 'string') {
      return badRequest('toDivisionId is required');
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return badRequest('reason is required');
    }

    if (toDivisionId === fromDivisionId) {
      return badRequest('Target division must be different from your current division');
    }

    // Validate target division exists
    const divisionResult = await dynamoDb.get({
      TableName: TableNames.DIVISIONS,
      Key: { divisionId: toDivisionId },
    });

    if (!divisionResult.Item) {
      return notFound('Target division not found');
    }

    // Check for existing pending request
    const existingResult = await dynamoDb.query({
      TableName: TableNames.TRANSFER_REQUESTS,
      IndexName: 'PlayerTransfersIndex',
      KeyConditionExpression: 'playerId = :playerId',
      FilterExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':playerId': playerId,
        ':pending': 'pending',
      },
    });

    if (existingResult.Items && existingResult.Items.length > 0) {
      return badRequest('You already have a pending transfer request. Cancel it before submitting a new one.');
    }

    const now = new Date().toISOString();
    const requestId = uuidv4();

    const item = {
      requestId,
      playerId,
      fromDivisionId,
      toDivisionId,
      reason: reason.trim(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDb.put({
      TableName: TableNames.TRANSFER_REQUESTS,
      Item: item,
    });

    return success(item);
  } catch (err) {
    console.error('Error creating transfer request:', err);
    return serverError('Failed to create transfer request');
  }
};
