import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Contract tests for ProgressionRepository, run against both the InMemory
 * implementation and the Dynamo implementation backed by a small fake of the
 * `dynamoDb` wrapper. Both must behave identically.
 */

// ── Fake DynamoDB ──────────────────────────────────────────────────
interface FakeTableSchema {
  hashKey: string;
  rangeKey?: string;
  indexes?: Record<string, { hashKey: string; rangeKey: string }>;
}

const SCHEMAS: Record<string, FakeTableSchema> = {
  ProgressionTracks: { hashKey: 'trackId' },
  PlayerProgression: {
    hashKey: 'playerId',
    rangeKey: 'trackId',
    indexes: { TrackIndex: { hashKey: 'trackId', rangeKey: 'progressPct' } },
  },
  ProgressionEvents: { hashKey: 'playerId', rangeKey: 'createdAtEventId' },
};

const fake = vi.hoisted(() => ({
  tables: new Map<string, Map<string, Record<string, unknown>>>(),
  queryCalls: [] as Array<Record<string, unknown>>,
}));

type Row = Record<string, unknown>;

function tableRows(tableName: string): Map<string, Row> {
  let rows = fake.tables.get(tableName);
  if (!rows) {
    rows = new Map();
    fake.tables.set(tableName, rows);
  }
  return rows;
}

function rowKey(tableName: string, key: Row): string {
  const schema = SCHEMAS[tableName];
  return schema.rangeKey
    ? `${String(key[schema.hashKey])}|${String(key[schema.rangeKey])}`
    : String(key[schema.hashKey]);
}

function conditionFailed(): Error {
  const err = new Error('The conditional request failed');
  err.name = 'ConditionalCheckFailedException';
  return err;
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

interface UpdateParams {
  TableName: string;
  Key: Row;
  UpdateExpression: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Row;
  ConditionExpression?: string;
}

interface QueryParams {
  TableName: string;
  IndexName?: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Row;
  KeyConditionExpression: string;
  ScanIndexForward?: boolean;
  Limit?: number;
}

/** Handles the expression shapes this repository emits: `SET #a = :a, ...` and `REMOVE #a`. */
function applyUpdate(params: UpdateParams): Row {
  const rows = tableRows(params.TableName);
  const id = rowKey(params.TableName, params.Key);
  const existing = rows.get(id);
  if (params.ConditionExpression?.startsWith('attribute_exists') && !existing) {
    throw conditionFailed();
  }
  const names = params.ExpressionAttributeNames ?? {};
  const values = params.ExpressionAttributeValues ?? {};
  // `size(#a) = :n`, optionally `(attribute_not_exists(#a) OR size(#a) = :n)`.
  for (const clause of (params.ConditionExpression ?? '').split(' AND ')) {
    const sizeMatch = /size\((#\w+)\) = (:\w+)/.exec(clause);
    if (!sizeMatch) continue;
    const stored = existing?.[names[sizeMatch[1]]];
    const holds = Array.isArray(stored)
      ? stored.length === values[sizeMatch[2]]
      : clause.includes('attribute_not_exists');
    if (!holds) throw conditionFailed();
  }
  const next: Row = { ...(existing ?? params.Key) };
  const setMatch = /SET (.*?)(?: REMOVE|$)/.exec(params.UpdateExpression);
  if (setMatch) {
    for (const assignment of setMatch[1].split(',')) {
      const [name, value] = assignment.split('=').map((part) => part.trim());
      next[names[name]] = structuredClone(values[value]);
    }
  }
  const removeMatch = /REMOVE (.*)$/.exec(params.UpdateExpression);
  if (removeMatch) {
    for (const name of removeMatch[1].split(',')) delete next[names[name.trim()]];
  }
  rows.set(id, next);
  return structuredClone(next);
}

function runQuery(params: QueryParams): Row[] {
  fake.queryCalls.push({ ...params });
  const schema = SCHEMAS[params.TableName];
  const keys = params.IndexName ? schema.indexes![params.IndexName] : schema;
  const hashValue = Object.values(params.ExpressionAttributeValues)[0];
  const rows = Array.from(tableRows(params.TableName).values())
    .filter((row) => row[keys.hashKey] === hashValue)
    // A GSI is sparse: rows without the index sort key are not in it.
    .filter((row) => !params.IndexName || (keys.rangeKey !== undefined && row[keys.rangeKey] !== undefined))
    .sort((a, b) => (keys.rangeKey ? compare(a[keys.rangeKey], b[keys.rangeKey]) : 0));
  if (params.ScanIndexForward === false) rows.reverse();
  return rows.map((row) => structuredClone(row));
}

vi.mock('../../dynamodb', () => ({
  TableNames: {
    PROGRESSION_TRACKS: 'ProgressionTracks',
    PLAYER_PROGRESSION: 'PlayerProgression',
    PROGRESSION_EVENTS: 'ProgressionEvents',
  },
  dynamoDb: {
    get: async (params: { TableName: string; Key: Row }) => {
      const row = tableRows(params.TableName).get(rowKey(params.TableName, params.Key));
      return row ? { Item: structuredClone(row) } : {};
    },
    put: async (params: { TableName: string; Item: Row }) => {
      tableRows(params.TableName).set(rowKey(params.TableName, params.Item), structuredClone(params.Item));
      return {};
    },
    update: async (params: UpdateParams) => ({ Attributes: applyUpdate(params) }),
    scanAll: async (params: { TableName: string }) =>
      Array.from(tableRows(params.TableName).values()).map((row) => structuredClone(row)),
    queryAll: async (params: QueryParams) => runQuery(params),
    query: async (params: QueryParams) => {
      const rows = runQuery(params);
      return { Items: params.Limit === undefined ? rows : rows.slice(0, params.Limit) };
    },
  },
}));

import { DynamoProgressionRepository } from '../dynamo/DynamoProgressionRepository';
import { InMemoryProgressionRepository } from '../inMemory/InMemoryProgressionRepository';
import { NotFoundError } from '../errors';
import type { ProgressionRepository } from '../progression';
import type { PlayerProgression, ProgressionEvent, ProgressionTrack } from '../types';

// ── Fixtures ───────────────────────────────────────────────────────
function track(overrides: Partial<ProgressionTrack> = {}): ProgressionTrack {
  return {
    trackId: 't-callup',
    kind: 'callup',
    name: 'Young Boys call-up',
    fromDivisionId: 'd-young',
    toDivisionId: 'd-main',
    goals: [
      { goalId: 'g1', metric: 'wins', threshold: 10, weight: 2 },
      { goalId: 'g2', metric: 'avgStarRating', threshold: 3.5, weight: 1, params: { minRatedMatches: 5 } },
    ],
    windowMode: 'sinceJoinedDivision',
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function progression(overrides: Partial<PlayerProgression> = {}): PlayerProgression {
  return {
    playerId: 'p1',
    trackId: 't-callup',
    progressPct: 40,
    goals: [
      { goalId: 'g1', current: 4, threshold: 10, met: false },
      { goalId: 'g2', current: null, threshold: 3.5, met: false },
    ],
    computedAt: '2026-11-10T00:00:00.000Z',
    ...overrides,
  };
}

function event(overrides: Partial<ProgressionEvent> = {}): ProgressionEvent {
  return {
    eventId: 'e1',
    playerId: 'p1',
    trackId: 't-callup',
    kind: 'callup',
    type: 'consideration_added',
    fromDivisionId: 'd-young',
    toDivisionId: 'd-main',
    actorUserId: 'admin-1',
    createdAt: '2026-11-10T10:00:00.000Z',
    ...overrides,
  };
}

const consideration = {
  status: 'considering' as const,
  markedBy: 'admin-1',
  markedAt: '2026-11-11T00:00:00.000Z',
  note: 'Strong month',
};

// ── Contract ───────────────────────────────────────────────────────
const implementations: Array<[string, () => ProgressionRepository]> = [
  ['InMemoryProgressionRepository', () => new InMemoryProgressionRepository()],
  ['DynamoProgressionRepository', () => new DynamoProgressionRepository()],
];

describe.each(implementations)('%s', (_name, makeRepo) => {
  let repo: ProgressionRepository;

  beforeEach(() => {
    fake.tables.clear();
    fake.queryCalls.length = 0;
    repo = makeRepo();
  });

  describe('tracks', () => {
    it('puts, gets and replaces a track', async () => {
      await repo.putTrack(track());
      expect(await repo.getTrack('t-callup')).toEqual(track());

      await repo.putTrack(track({ name: 'Renamed', isActive: false }));
      expect(await repo.getTrack('t-callup')).toEqual(track({ name: 'Renamed', isActive: false }));
    });

    it('returns null for a missing track', async () => {
      expect(await repo.getTrack('nope')).toBeNull();
    });

    it('lists tracks by name and filters by kind, isActive and fromDivisionId', async () => {
      await repo.putTrack(track({ trackId: 't1', name: 'Zeta', kind: 'promotion', fromDivisionId: 'd-mid' }));
      await repo.putTrack(track({ trackId: 't2', name: 'Alpha', kind: 'callup' }));
      await repo.putTrack(track({ trackId: 't3', name: 'Mid', kind: 'relegation', isActive: false, fromDivisionId: 'd-mid' }));

      expect((await repo.listTracks()).map((t) => t.trackId)).toEqual(['t2', 't3', 't1']);
      expect((await repo.listTracks({ kind: 'promotion' })).map((t) => t.trackId)).toEqual(['t1']);
      expect((await repo.listTracks({ isActive: true })).map((t) => t.trackId)).toEqual(['t2', 't1']);
      expect((await repo.listTracks({ fromDivisionId: 'd-mid', isActive: false })).map((t) => t.trackId))
        .toEqual(['t3']);
    });
  });

  describe('player progression', () => {
    it('creates on first upsert and reads it back', async () => {
      const stored = await repo.upsertPlayerProgression(progression());
      expect(stored).toEqual(progression());
      expect(await repo.getPlayerProgression('p1', 't-callup')).toEqual(progression());
      expect(await repo.getPlayerProgression('p1', 'other')).toBeNull();
    });

    it('keeps an existing consideration when a recompute upserts without one', async () => {
      await repo.upsertPlayerProgression(progression());
      await repo.setConsideration('p1', 't-callup', consideration);

      const recomputed = await repo.upsertPlayerProgression(
        progression({ progressPct: 75, computedAt: '2026-11-12T00:00:00.000Z' }),
      );

      expect(recomputed.progressPct).toBe(75);
      expect(recomputed.computedAt).toBe('2026-11-12T00:00:00.000Z');
      expect(recomputed.consideration).toEqual(consideration);
    });

    it('writes a consideration carried on the upsert input', async () => {
      const stored = await repo.upsertPlayerProgression(progression({ consideration }));
      expect(stored.consideration).toEqual(consideration);
    });

    it('sets and clears consideration on an existing row', async () => {
      await repo.upsertPlayerProgression(progression());

      const marked = await repo.setConsideration('p1', 't-callup', consideration);
      expect(marked.consideration).toEqual(consideration);
      expect(marked.progressPct).toBe(40);

      const cleared = await repo.clearConsideration('p1', 't-callup');
      expect(cleared.consideration).toBeUndefined();
      expect((await repo.getPlayerProgression('p1', 't-callup'))?.consideration).toBeUndefined();
    });

    it('throws NotFoundError when marking or clearing a missing row', async () => {
      await expect(repo.setConsideration('p1', 't-callup', consideration)).rejects.toBeInstanceOf(NotFoundError);
      await expect(repo.clearConsideration('p1', 't-callup')).rejects.toBeInstanceOf(NotFoundError);
      expect(await repo.getPlayerProgression('p1', 't-callup')).toBeNull();
    });

    it('records notified milestones optimistically and keeps them across upserts', async () => {
      await repo.upsertPlayerProgression(progression());
      const next = { notifiedThresholds: [50], notifiedGoalIds: ['g1'] };

      expect(await repo.recordNotifiedMilestones('p1', 't-callup', next, { thresholds: 0, goals: 0 })).toBe(true);
      // A second writer that read the empty lists loses.
      expect(await repo.recordNotifiedMilestones('p1', 't-callup', next, { thresholds: 0, goals: 0 })).toBe(false);
      // No row: loses, and creates nothing.
      expect(await repo.recordNotifiedMilestones('p9', 't-callup', next, { thresholds: 0, goals: 0 })).toBe(false);
      expect(await repo.getPlayerProgression('p9', 't-callup')).toBeNull();

      const grown = { notifiedThresholds: [50, 75], notifiedGoalIds: ['g1'] };
      expect(await repo.recordNotifiedMilestones('p1', 't-callup', grown, { thresholds: 1, goals: 1 })).toBe(true);

      const after = await repo.upsertPlayerProgression(progression({ progressPct: 20 }));
      expect(after.notifiedThresholds).toEqual([50, 75]);
      expect(after.notifiedGoalIds).toEqual(['g1']);
      expect(await repo.getPlayerProgression('p1', 't-callup')).toMatchObject(grown);
    });

    it('lists one player across tracks', async () => {
      await repo.upsertPlayerProgression(progression({ trackId: 't-b' }));
      await repo.upsertPlayerProgression(progression({ trackId: 't-a' }));
      await repo.upsertPlayerProgression(progression({ playerId: 'p2', trackId: 't-a' }));

      expect((await repo.listByPlayer('p1')).map((p) => p.trackId)).toEqual(['t-a', 't-b']);
    });

    it('lists a track sorted by progressPct, highest first by default', async () => {
      await repo.upsertPlayerProgression(progression({ playerId: 'p1', progressPct: 40 }));
      await repo.upsertPlayerProgression(progression({ playerId: 'p2', progressPct: 90 }));
      await repo.upsertPlayerProgression(progression({ playerId: 'p3', progressPct: 5 }));
      await repo.upsertPlayerProgression(progression({ playerId: 'p4', trackId: 'other', progressPct: 99 }));

      expect((await repo.listByTrack('t-callup')).map((p) => p.playerId)).toEqual(['p2', 'p1', 'p3']);
      expect((await repo.listByTrack('t-callup', { descending: false })).map((p) => p.playerId))
        .toEqual(['p3', 'p1', 'p2']);
      expect((await repo.listByTrack('t-callup', { limit: 2 })).map((p) => p.playerId)).toEqual(['p2', 'p1']);
    });

    it('returns copies, so callers cannot mutate stored rows', async () => {
      await repo.upsertPlayerProgression(progression());
      const read = await repo.getPlayerProgression('p1', 't-callup');
      read!.goals[0].current = 999;
      expect((await repo.getPlayerProgression('p1', 't-callup'))!.goals[0].current).toBe(4);
    });
  });

  describe('events', () => {
    it('appends and lists one player newest first', async () => {
      await repo.appendEvent(event({ eventId: 'e1', createdAt: '2026-11-10T10:00:00.000Z' }));
      await repo.appendEvent(event({ eventId: 'e3', createdAt: '2026-11-12T10:00:00.000Z', type: 'executed' }));
      await repo.appendEvent(event({ eventId: 'e2', createdAt: '2026-11-11T10:00:00.000Z', type: 'consideration_removed' }));
      await repo.appendEvent(event({ eventId: 'x', playerId: 'p2' }));

      const events = await repo.listEvents('p1');
      expect(events.map((e) => e.eventId)).toEqual(['e3', 'e2', 'e1']);
      expect(events[0]).toEqual(event({ eventId: 'e3', createdAt: '2026-11-12T10:00:00.000Z', type: 'executed' }));
      expect((await repo.listEvents('p1', { limit: 1 })).map((e) => e.eventId)).toEqual(['e3']);
    });

    it('keeps two events written in the same millisecond', async () => {
      const createdAt = '2026-11-12T10:00:00.000Z';
      await repo.appendEvent(event({ eventId: 'a', createdAt, type: 'executed' }));
      await repo.appendEvent(event({ eventId: 'b', createdAt, type: 'consideration_removed' }));

      expect((await repo.listEvents('p1')).map((e) => e.eventId).sort()).toEqual(['a', 'b']);
    });

    it('omits toDivisionId when the event has none', async () => {
      const relegation = event({ kind: 'relegation' });
      delete relegation.toDivisionId;
      await repo.appendEvent(relegation);

      const [stored] = await repo.listEvents('p1');
      expect(stored).toEqual(relegation);
      expect('toDivisionId' in stored).toBe(false);
    });
  });
});

describe('DynamoProgressionRepository query shapes', () => {
  beforeEach(() => {
    fake.tables.clear();
    fake.queryCalls.length = 0;
  });

  it('reads a track through the TrackIndex GSI, descending', async () => {
    await new DynamoProgressionRepository().listByTrack('t-callup');
    expect(fake.queryCalls[0]).toMatchObject({
      TableName: 'PlayerProgression',
      IndexName: 'TrackIndex',
      ScanIndexForward: false,
    });
  });

  it('stores the event sort key as createdAt#eventId', async () => {
    await new DynamoProgressionRepository().appendEvent(event());
    const [row] = Array.from(tableRows('ProgressionEvents').values());
    expect(row.createdAtEventId).toBe('2026-11-10T10:00:00.000Z#e1');
  });
});
