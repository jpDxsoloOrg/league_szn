import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  TransferCreateInput,
  TransferReviewInput,
  TransfersRepository,
} from '../TransfersRepository';
import type { TransferRequest } from '../types';

export class DynamoTransfersRepository implements TransfersRepository {
  async findById(requestId: string): Promise<TransferRequest | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.TRANSFER_REQUESTS,
      Key: { requestId },
    });
    return (result.Item as TransferRequest | undefined) ?? null;
  }

  async list(): Promise<TransferRequest[]> {
    const result = await dynamoDb.scanAll({
      TableName: TableNames.TRANSFER_REQUESTS,
    });
    const items = result as unknown as TransferRequest[];
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listByStatus(status: string): Promise<TransferRequest[]> {
    const result = await dynamoDb.queryAll({
      TableName: TableNames.TRANSFER_REQUESTS,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
    });
    const items = result as unknown as TransferRequest[];
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listByPlayer(playerId: string): Promise<TransferRequest[]> {
    const result = await dynamoDb.queryAll({
      TableName: TableNames.TRANSFER_REQUESTS,
      IndexName: 'PlayerTransfersIndex',
      KeyConditionExpression: 'playerId = :playerId',
      ExpressionAttributeValues: { ':playerId': playerId },
    });
    const items = result as unknown as TransferRequest[];
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listPendingByPlayer(playerId: string): Promise<TransferRequest[]> {
    const result = await dynamoDb.queryAll({
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
    return result as unknown as TransferRequest[];
  }

  async create(input: TransferCreateInput): Promise<TransferRequest> {
    const now = new Date().toISOString();
    const item: TransferRequest = {
      requestId: uuidv4(),
      playerId: input.playerId,
      fromDivisionId: input.fromDivisionId,
      toDivisionId: input.toDivisionId,
      reason: input.reason,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({
      TableName: TableNames.TRANSFER_REQUESTS,
      Item: item,
    });
    return item;
  }

  async review(
    requestId: string,
    input: TransferReviewInput,
  ): Promise<TransferRequest> {
    const existing = await this.findById(requestId);
    if (!existing) throw new NotFoundError('TransferRequest', requestId);

    const now = new Date().toISOString();

    const updateExpr: string[] = [
      '#status = :status',
      'updatedAt = :updatedAt',
      'reviewedBy = :reviewedBy',
    ];
    const attrNames: Record<string, string> = { '#status': 'status' };
    const attrValues: Record<string, unknown> = {
      ':status': input.status,
      ':updatedAt': now,
      ':reviewedBy': input.reviewedBy,
    };

    if (input.reviewNote) {
      updateExpr.push('reviewNote = :reviewNote');
      attrValues[':reviewNote'] = input.reviewNote;
    }

    const result = await dynamoDb.update({
      TableName: TableNames.TRANSFER_REQUESTS,
      Key: { requestId },
      UpdateExpression: `SET ${updateExpr.join(', ')}`,
      ExpressionAttributeNames: attrNames,
      ExpressionAttributeValues: attrValues,
      ReturnValues: 'ALL_NEW',
    });

    return result.Attributes as TransferRequest;
  }
}
