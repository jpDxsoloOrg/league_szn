import { dynamoDb, TableNames } from '../../dynamodb';
import type {
  MatchmakingRepository,
  PresenceRecord,
  QueueRecord,
  InvitationRecord,
} from '../MatchmakingRepository';

export class DynamoMatchmakingRepository implements MatchmakingRepository {
  // ── Presence ──────────────────────────────────────────────────────────

  async putPresence(record: PresenceRecord): Promise<void> {
    await dynamoDb.put({ TableName: TableNames.PRESENCE, Item: record });
  }

  async getPresence(playerId: string): Promise<PresenceRecord | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.PRESENCE,
      Key: { playerId },
    });
    return (result.Item as PresenceRecord | undefined) ?? null;
  }

  async listPresence(): Promise<PresenceRecord[]> {
    return (await dynamoDb.scanAll({
      TableName: TableNames.PRESENCE,
    })) as unknown as PresenceRecord[];
  }

  async deletePresence(playerId: string): Promise<void> {
    await dynamoDb.delete({ TableName: TableNames.PRESENCE, Key: { playerId } });
  }

  // ── Queue ─────────────────────────────────────────────────────────────

  async putQueue(record: QueueRecord): Promise<void> {
    await dynamoDb.put({ TableName: TableNames.MATCHMAKING_QUEUE, Item: record });
  }

  async listQueue(): Promise<QueueRecord[]> {
    return (await dynamoDb.scanAll({
      TableName: TableNames.MATCHMAKING_QUEUE,
    })) as unknown as QueueRecord[];
  }

  async deleteQueue(playerId: string): Promise<void> {
    await dynamoDb.delete({ TableName: TableNames.MATCHMAKING_QUEUE, Key: { playerId } });
  }

  // ── Invitations ───────────────────────────────────────────────────────

  async putInvitation(record: InvitationRecord): Promise<void> {
    await dynamoDb.put({ TableName: TableNames.MATCH_INVITATIONS, Item: record });
  }

  async getInvitation(invitationId: string): Promise<InvitationRecord | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.MATCH_INVITATIONS,
      Key: { invitationId },
    });
    return (result.Item as InvitationRecord | undefined) ?? null;
  }

  async listInvitationsByToPlayer(toPlayerId: string): Promise<InvitationRecord[]> {
    const result = await dynamoDb.query({
      TableName: TableNames.MATCH_INVITATIONS,
      IndexName: 'ToPlayerIndex',
      KeyConditionExpression: 'toPlayerId = :pid',
      ExpressionAttributeValues: { ':pid': toPlayerId },
    });
    return (result.Items ?? []) as unknown as InvitationRecord[];
  }

  async listInvitationsByFromPlayer(fromPlayerId: string): Promise<InvitationRecord[]> {
    const result = await dynamoDb.query({
      TableName: TableNames.MATCH_INVITATIONS,
      IndexName: 'FromPlayerIndex',
      KeyConditionExpression: 'fromPlayerId = :pid',
      ExpressionAttributeValues: { ':pid': fromPlayerId },
    });
    return (result.Items ?? []) as unknown as InvitationRecord[];
  }

  async updateInvitation(
    invitationId: string,
    patch: Record<string, unknown>,
    conditionStatus?: string,
  ): Promise<InvitationRecord> {
    const setExpressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};

    for (const [field, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const tok = field.replace(/[^a-zA-Z0-9_]/g, '_');
      setExpressions.push(`#${tok} = :${tok}`);
      names[`#${tok}`] = field;
      values[`:${tok}`] = value;
    }

    if (setExpressions.length === 0) {
      const existing = await this.getInvitation(invitationId);
      if (!existing) throw new Error('Invitation not found');
      return existing;
    }

    let conditionExpression: string | undefined;
    if (conditionStatus) {
      names['#condStatus'] = 'status';
      values[':condStatusVal'] = conditionStatus;
      conditionExpression = '#condStatus = :condStatusVal';
    }

    const result = await dynamoDb.update({
      TableName: TableNames.MATCH_INVITATIONS,
      Key: { invitationId },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ...(conditionExpression ? { ConditionExpression: conditionExpression } : {}),
      ReturnValues: 'ALL_NEW',
    });

    return result.Attributes as InvitationRecord;
  }
}
