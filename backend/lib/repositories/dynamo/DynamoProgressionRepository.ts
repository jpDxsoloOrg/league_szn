import type { QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  ListByTrackOptions,
  ListProgressionEventsOptions,
  ProgressionRepository,
  ProgressionTrackFilter,
} from '../progression';
import type {
  PlayerProgression,
  ProgressionConsideration,
  ProgressionEvent,
  ProgressionTrack,
} from '../types';
import {
  buildUpsertProgressionUpdate,
  fromPlayerProgressionItem,
  fromProgressionEventItem,
  fromProgressionTrackItem,
  toProgressionEventItem,
} from './progressionRows';

export const TRACK_INDEX = 'TrackIndex';

const isConditionalCheckFailed = (err: unknown): boolean =>
  !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'ConditionalCheckFailedException';

const progressionId = (playerId: string, trackId: string): string => `${playerId}/${trackId}`;

/** Query, following pages until `limit` rows are collected (or every row when omitted). */
async function queryUpTo(params: QueryCommandInput, limit?: number): Promise<Record<string, unknown>[]> {
  if (limit === undefined) return dynamoDb.queryAll(params);
  if (limit <= 0) return [];
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const page = await dynamoDb.query({
      ...params,
      Limit: limit - items.length,
      ExclusiveStartKey: lastKey,
    });
    items.push(...((page.Items ?? []) as Record<string, unknown>[]));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey && items.length < limit);
  return items;
}

export class DynamoProgressionRepository implements ProgressionRepository {
  // ── Tracks ───────────────────────────────────────────────────────
  async listTracks(filter: ProgressionTrackFilter = {}): Promise<ProgressionTrack[]> {
    const rows = await dynamoDb.scanAll({ TableName: TableNames.PROGRESSION_TRACKS });
    return rows
      .map(fromProgressionTrackItem)
      .filter((track) =>
        (filter.kind === undefined || track.kind === filter.kind) &&
        (filter.isActive === undefined || track.isActive === filter.isActive) &&
        (filter.fromDivisionId === undefined || track.fromDivisionId === filter.fromDivisionId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getTrack(trackId: string): Promise<ProgressionTrack | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.PROGRESSION_TRACKS,
      Key: { trackId },
    });
    return result.Item ? fromProgressionTrackItem(result.Item) : null;
  }

  async putTrack(track: ProgressionTrack): Promise<ProgressionTrack> {
    await dynamoDb.put({
      TableName: TableNames.PROGRESSION_TRACKS,
      Item: { ...track },
    });
    return { ...track };
  }

  // ── Player progression ──────────────────────────────────────────
  async getPlayerProgression(playerId: string, trackId: string): Promise<PlayerProgression | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.PLAYER_PROGRESSION,
      Key: { playerId, trackId },
    });
    return result.Item ? fromPlayerProgressionItem(result.Item) : null;
  }

  async listByPlayer(playerId: string): Promise<PlayerProgression[]> {
    const rows = await dynamoDb.queryAll({
      TableName: TableNames.PLAYER_PROGRESSION,
      KeyConditionExpression: '#playerId = :playerId',
      ExpressionAttributeNames: { '#playerId': 'playerId' },
      ExpressionAttributeValues: { ':playerId': playerId },
    });
    return rows.map(fromPlayerProgressionItem);
  }

  async upsertPlayerProgression(progression: PlayerProgression): Promise<PlayerProgression> {
    const result = await dynamoDb.update({
      TableName: TableNames.PLAYER_PROGRESSION,
      ...buildUpsertProgressionUpdate(progression),
      ReturnValues: 'ALL_NEW',
    });
    return fromPlayerProgressionItem(result.Attributes ?? {});
  }

  async listByTrack(trackId: string, options: ListByTrackOptions = {}): Promise<PlayerProgression[]> {
    const rows = await queryUpTo(
      {
        TableName: TableNames.PLAYER_PROGRESSION,
        IndexName: TRACK_INDEX,
        KeyConditionExpression: '#trackId = :trackId',
        ExpressionAttributeNames: { '#trackId': 'trackId' },
        ExpressionAttributeValues: { ':trackId': trackId },
        ScanIndexForward: options.descending === false,
      },
      options.limit,
    );
    return rows.map(fromPlayerProgressionItem);
  }

  async setConsideration(
    playerId: string,
    trackId: string,
    consideration: ProgressionConsideration,
  ): Promise<PlayerProgression> {
    return this.updateExisting(playerId, trackId, {
      UpdateExpression: 'SET #consideration = :consideration',
      ExpressionAttributeNames: { '#consideration': 'consideration' },
      ExpressionAttributeValues: { ':consideration': consideration },
    });
  }

  async clearConsideration(playerId: string, trackId: string): Promise<PlayerProgression> {
    return this.updateExisting(playerId, trackId, {
      UpdateExpression: 'REMOVE #consideration',
      ExpressionAttributeNames: { '#consideration': 'consideration' },
    });
  }

  private async updateExisting(
    playerId: string,
    trackId: string,
    update: {
      UpdateExpression: string;
      ExpressionAttributeNames: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    },
  ): Promise<PlayerProgression> {
    try {
      const result = await dynamoDb.update({
        TableName: TableNames.PLAYER_PROGRESSION,
        Key: { playerId, trackId },
        ...update,
        ConditionExpression: 'attribute_exists(playerId)',
        ReturnValues: 'ALL_NEW',
      });
      return fromPlayerProgressionItem(result.Attributes ?? {});
    } catch (err: unknown) {
      if (isConditionalCheckFailed(err)) {
        throw new NotFoundError('PlayerProgression', progressionId(playerId, trackId));
      }
      throw err;
    }
  }

  // ── Events ──────────────────────────────────────────────────────
  async appendEvent(event: ProgressionEvent): Promise<ProgressionEvent> {
    await dynamoDb.put({
      TableName: TableNames.PROGRESSION_EVENTS,
      Item: toProgressionEventItem(event),
    });
    return { ...event };
  }

  async listEvents(playerId: string, options: ListProgressionEventsOptions = {}): Promise<ProgressionEvent[]> {
    const rows = await queryUpTo(
      {
        TableName: TableNames.PROGRESSION_EVENTS,
        KeyConditionExpression: '#playerId = :playerId',
        ExpressionAttributeNames: { '#playerId': 'playerId' },
        ExpressionAttributeValues: { ':playerId': playerId },
        ScanIndexForward: false,
      },
      options.limit,
    );
    return rows.map(fromProgressionEventItem);
  }
}
