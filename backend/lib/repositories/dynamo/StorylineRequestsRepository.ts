import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  StorylineRequestCreateInput,
  StorylineRequestReviewInput,
  StorylineRequestsRepository,
} from '../StorylineRequestsRepository';
import type { StorylineRequest, StorylineRequestStatus } from '../types';

export class DynamoStorylineRequestsRepository
  implements StorylineRequestsRepository
{
  async findById(requestId: string): Promise<StorylineRequest | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.STORYLINE_REQUESTS,
      Key: { requestId },
    });
    return (result.Item as StorylineRequest | undefined) ?? null;
  }

  async list(): Promise<StorylineRequest[]> {
    const result = await dynamoDb.scanAll({
      TableName: TableNames.STORYLINE_REQUESTS,
    });
    const items = result as unknown as StorylineRequest[];
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listByStatus(
    status: StorylineRequestStatus,
  ): Promise<StorylineRequest[]> {
    const result = await dynamoDb.queryAll({
      TableName: TableNames.STORYLINE_REQUESTS,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: false,
    });
    const items = result as unknown as StorylineRequest[];
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async listByRequester(requesterId: string): Promise<StorylineRequest[]> {
    const result = await dynamoDb.queryAll({
      TableName: TableNames.STORYLINE_REQUESTS,
      IndexName: 'RequesterIndex',
      KeyConditionExpression: 'requesterId = :requesterId',
      ExpressionAttributeValues: { ':requesterId': requesterId },
      ScanIndexForward: false,
    });
    const items = result as unknown as StorylineRequest[];
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async create(
    input: StorylineRequestCreateInput,
  ): Promise<StorylineRequest> {
    const now = new Date().toISOString();
    const item: StorylineRequest = {
      requestId: uuidv4(),
      requesterId: input.requesterId,
      targetPlayerIds: input.targetPlayerIds,
      requestType: input.requestType,
      description: input.description,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({
      TableName: TableNames.STORYLINE_REQUESTS,
      Item: item,
    });
    return item;
  }

  async review(
    requestId: string,
    input: StorylineRequestReviewInput,
  ): Promise<StorylineRequest> {
    const existing = await this.findById(requestId);
    if (!existing) throw new NotFoundError('StorylineRequest', requestId);

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

    if (input.gmNote) {
      updateExpr.push('gmNote = :gmNote');
      attrValues[':gmNote'] = input.gmNote;
    }

    const result = await dynamoDb.update({
      TableName: TableNames.STORYLINE_REQUESTS,
      Key: { requestId },
      UpdateExpression: `SET ${updateExpr.join(', ')}`,
      ExpressionAttributeNames: attrNames,
      ExpressionAttributeValues: attrValues,
      ReturnValues: 'ALL_NEW',
    });

    return result.Attributes as StorylineRequest;
  }
}
