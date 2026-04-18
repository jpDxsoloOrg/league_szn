import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  TagTeamCreateInput,
  TagTeamPatch,
  TagTeamsRepository,
} from '../TagTeamsRepository';
import type { TagTeam, TagTeamStatus } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoTagTeamsRepository implements TagTeamsRepository {
  async findById(tagTeamId: string): Promise<TagTeam | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.TAG_TEAMS,
      Key: { tagTeamId },
    });
    return (result.Item as TagTeam | undefined) ?? null;
  }

  async list(): Promise<TagTeam[]> {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.TAG_TEAMS,
    });
    const tagTeams = items as unknown as TagTeam[];
    tagTeams.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return tagTeams;
  }

  async listByStatus(status: TagTeamStatus): Promise<TagTeam[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.TAG_TEAMS,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
    });
    return items as unknown as TagTeam[];
  }

  async listByPlayer(playerId: string): Promise<TagTeam[]> {
    const [player1Result, player2Result] = await Promise.all([
      dynamoDb.queryAll({
        TableName: TableNames.TAG_TEAMS,
        IndexName: 'Player1Index',
        KeyConditionExpression: 'player1Id = :pid',
        ExpressionAttributeValues: { ':pid': playerId },
      }),
      dynamoDb.queryAll({
        TableName: TableNames.TAG_TEAMS,
        IndexName: 'Player2Index',
        KeyConditionExpression: 'player2Id = :pid',
        ExpressionAttributeValues: { ':pid': playerId },
      }),
    ]);

    // Deduplicate by tagTeamId
    const seen = new Set<string>();
    const merged: TagTeam[] = [];
    for (const item of [...player1Result, ...player2Result]) {
      const tagTeam = item as unknown as TagTeam;
      if (!seen.has(tagTeam.tagTeamId)) {
        seen.add(tagTeam.tagTeamId);
        merged.push(tagTeam);
      }
    }

    merged.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return merged;
  }

  async create(input: TagTeamCreateInput): Promise<TagTeam> {
    const now = new Date().toISOString();
    const item: TagTeam = {
      tagTeamId: uuidv4(),
      name: input.name,
      player1Id: input.player1Id,
      player2Id: input.player2Id,
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      status: input.status ?? 'pending_partner',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.TAG_TEAMS, Item: item });
    return item;
  }

  async update(tagTeamId: string, patch: TagTeamPatch): Promise<TagTeam> {
    const expr = buildUpdateExpression(patch, new Date().toISOString());
    const result = await dynamoDb
      .update({
        TableName: TableNames.TAG_TEAMS,
        Key: { tagTeamId },
        UpdateExpression: expr.UpdateExpression,
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
        ConditionExpression: 'attribute_exists(tagTeamId)',
        ReturnValues: 'ALL_NEW',
      })
      .catch((err: { name?: string }) => {
        if (err.name === 'ConditionalCheckFailedException') {
          throw new NotFoundError('TagTeam', tagTeamId);
        }
        throw err;
      });
    return result.Attributes as TagTeam;
  }

  async delete(tagTeamId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.TAG_TEAMS,
      Key: { tagTeamId },
    });
  }
}
