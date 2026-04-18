import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  StableCreateInput,
  StablePatch,
  StableInvitationCreateInput,
  StablesRepository,
} from '../StablesRepository';
import type { Stable, StableStatus, StableInvitation } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoStablesRepository implements StablesRepository {
  // ─── Stables ─────────────────────────────────────────────────────

  async findById(stableId: string): Promise<Stable | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.STABLES,
      Key: { stableId },
    });
    return (result.Item as Stable | undefined) ?? null;
  }

  async list(): Promise<Stable[]> {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.STABLES,
    });
    return items as unknown as Stable[];
  }

  async listByStatus(status: StableStatus): Promise<Stable[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.STABLES,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: false,
    });
    return items as unknown as Stable[];
  }

  async findByPlayer(playerId: string): Promise<Stable | null> {
    // memberIds is a list attribute; no GSI exists for this lookup,
    // so we scan with a filter using the `contains` function.
    const items = await dynamoDb.scanAll({
      TableName: TableNames.STABLES,
      FilterExpression: 'contains(memberIds, :pid)',
      ExpressionAttributeValues: { ':pid': playerId },
    });
    return (items[0] as unknown as Stable) ?? null;
  }

  async create(input: StableCreateInput): Promise<Stable> {
    const now = new Date().toISOString();
    const item: Stable = {
      stableId: uuidv4(),
      name: input.name,
      leaderId: input.leaderId,
      memberIds: input.memberIds,
      imageUrl: input.imageUrl,
      status: input.status ?? 'pending',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.STABLES, Item: item });
    return item;
  }

  async update(stableId: string, patch: StablePatch): Promise<Stable> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb
      .update({
        TableName: TableNames.STABLES,
        Key: { stableId },
        UpdateExpression: expr.UpdateExpression,
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(stableId)',
        ReturnValues: 'ALL_NEW',
      })
      .catch((err: { name?: string }) => {
        if (err.name === 'ConditionalCheckFailedException') {
          throw new NotFoundError('Stable', stableId);
        }
        throw err;
      });
    return result.Attributes as Stable;
  }

  async delete(stableId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.STABLES,
      Key: { stableId },
    });
  }

  // ─── Invitations ─────────────────────────────────────────────────

  async findInvitationById(invitationId: string): Promise<StableInvitation | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.STABLE_INVITATIONS,
      Key: { invitationId },
    });
    return (result.Item as StableInvitation | undefined) ?? null;
  }

  async listInvitationsByStable(stableId: string): Promise<StableInvitation[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.STABLE_INVITATIONS,
      IndexName: 'StableIndex',
      KeyConditionExpression: '#stableId = :stableId',
      ExpressionAttributeNames: { '#stableId': 'stableId' },
      ExpressionAttributeValues: { ':stableId': stableId },
      ScanIndexForward: false,
    });
    return items as unknown as StableInvitation[];
  }

  async listInvitationsByPlayer(playerId: string): Promise<StableInvitation[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.STABLE_INVITATIONS,
      IndexName: 'InvitedPlayerIndex',
      KeyConditionExpression: 'invitedPlayerId = :pid',
      ExpressionAttributeValues: { ':pid': playerId },
      ScanIndexForward: false,
    });
    return items as unknown as StableInvitation[];
  }

  async listPendingInvitationsByPlayer(playerId: string): Promise<StableInvitation[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.STABLE_INVITATIONS,
      IndexName: 'InvitedPlayerIndex',
      KeyConditionExpression: 'invitedPlayerId = :pid',
      FilterExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pid': playerId, ':pending': 'pending' },
      ScanIndexForward: false,
    });
    return items as unknown as StableInvitation[];
  }

  async createInvitation(input: StableInvitationCreateInput): Promise<StableInvitation> {
    const now = new Date().toISOString();
    const item: StableInvitation = {
      invitationId: uuidv4(),
      stableId: input.stableId,
      invitedPlayerId: input.invitedPlayerId,
      invitedByPlayerId: input.invitedByPlayerId,
      message: input.message,
      status: 'pending',
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.STABLE_INVITATIONS, Item: item });
    return item;
  }

  async updateInvitation(
    invitationId: string,
    patch: Partial<StableInvitation>,
  ): Promise<StableInvitation> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb
      .update({
        TableName: TableNames.STABLE_INVITATIONS,
        Key: { invitationId },
        UpdateExpression: expr.UpdateExpression,
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(invitationId)',
        ReturnValues: 'ALL_NEW',
      })
      .catch((err: { name?: string }) => {
        if (err.name === 'ConditionalCheckFailedException') {
          throw new NotFoundError('StableInvitation', invitationId);
        }
        throw err;
      });
    return result.Attributes as StableInvitation;
  }
}
