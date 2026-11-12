/**
 * Row mapping shared by DynamoProgressionRepository and DynamoUnitOfWork, so
 * the direct and transactional write paths produce identical items.
 */
import { progressionEventSortKey } from '../progression';
import type {
  PlayerProgression,
  ProgressionEvent,
  ProgressionTrack,
} from '../types';

export interface UpdateParts {
  Key: Record<string, unknown>;
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
}

/**
 * SET the computed fields; also SET `consideration` only when the input has
 * one. Leaving it out of the expression keeps whatever an admin stored.
 */
export function buildUpsertProgressionUpdate(progression: PlayerProgression): UpdateParts {
  const sets = ['#progressPct = :progressPct', '#goals = :goals', '#computedAt = :computedAt'];
  const names: Record<string, string> = {
    '#progressPct': 'progressPct',
    '#goals': 'goals',
    '#computedAt': 'computedAt',
  };
  const values: Record<string, unknown> = {
    ':progressPct': progression.progressPct,
    ':goals': progression.goals,
    ':computedAt': progression.computedAt,
  };
  if (progression.consideration) {
    sets.push('#consideration = :consideration');
    names['#consideration'] = 'consideration';
    values[':consideration'] = progression.consideration;
  }
  return {
    Key: { playerId: progression.playerId, trackId: progression.trackId },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

export function toProgressionEventItem(event: ProgressionEvent): Record<string, unknown> {
  return {
    ...event,
    createdAtEventId: progressionEventSortKey(event),
  };
}

export function fromProgressionEventItem(row: Record<string, unknown>): ProgressionEvent {
  const event: ProgressionEvent = {
    eventId: row.eventId as string,
    playerId: row.playerId as string,
    trackId: row.trackId as string,
    kind: row.kind as ProgressionEvent['kind'],
    type: row.type as ProgressionEvent['type'],
    fromDivisionId: row.fromDivisionId as string,
    actorUserId: row.actorUserId as string,
    createdAt: row.createdAt as string,
  };
  if (typeof row.toDivisionId === 'string') event.toDivisionId = row.toDivisionId;
  return event;
}

export function fromPlayerProgressionItem(row: Record<string, unknown>): PlayerProgression {
  const progression: PlayerProgression = {
    playerId: row.playerId as string,
    trackId: row.trackId as string,
    progressPct: row.progressPct as number,
    goals: (row.goals ?? []) as PlayerProgression['goals'],
    computedAt: row.computedAt as string,
  };
  if (row.consideration) {
    progression.consideration = row.consideration as PlayerProgression['consideration'];
  }
  return progression;
}

export function fromProgressionTrackItem(row: Record<string, unknown>): ProgressionTrack {
  return row as unknown as ProgressionTrack;
}
