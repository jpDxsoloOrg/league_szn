import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import {
  participantSk,
  RIVALRY_META_SK,
  type CreateRivalryInput,
  type ListPage,
  type ListPageOptions,
  type RivalriesRepository,
  type Rivalry,
  type RivalryHeat,
  type RivalryMessage,
  type RivalryMessagePostInput,
  type RivalryMessagesRepository,
  type RivalryNote,
  type RivalryNoteCreateInput,
  type RivalryNotePatch,
  type RivalryNoteType,
  type RivalryNotesRepository,
  type RivalryParticipant,
  type RivalryParticipantRole,
  type RivalryPatch,
  type RivalryStatus,
} from '../rivalries';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const clampLimit = (n: number | undefined): number => {
  if (!n || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
};

const encodeCursor = (key: Record<string, unknown> | undefined): string | undefined =>
  key ? Buffer.from(JSON.stringify(key)).toString('base64') : undefined;

const decodeCursor = (cursor: string | undefined): Record<string, unknown> | undefined => {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid pagination cursor');
  }
};

// ─── Row shapes ────────────────────────────────────────────────────────

interface MetaRow {
  rivalryId: string;
  recordType: 'META';
  title: string;
  description?: string;
  status: RivalryStatus;
  heat: RivalryHeat;
  requestedBy: string;
  moderatedBy?: string;
  moderationNote?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ParticipantRow {
  rivalryId: string;
  recordType: string; // PARTICIPANT#<playerId>
  participantId: string;
  role: RivalryParticipantRole;
  addedAt: string;
}

function isMetaRow(row: Record<string, unknown>): boolean {
  return (row as { recordType?: string }).recordType === RIVALRY_META_SK;
}

function aggregateFromRows(meta: MetaRow, participantRows: ParticipantRow[]): Rivalry {
  return {
    rivalryId: meta.rivalryId,
    title: meta.title,
    description: meta.description,
    status: meta.status,
    heat: meta.heat,
    requestedBy: meta.requestedBy,
    moderatedBy: meta.moderatedBy,
    moderationNote: meta.moderationNote,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    participants: participantRows
      .map<RivalryParticipant>((row) => ({
        playerId: row.participantId,
        role: row.role,
        addedAt: row.addedAt,
      }))
      .sort((a, b) => (a.addedAt < b.addedAt ? -1 : 1)),
  };
}

// ─── RivalriesRepository ───────────────────────────────────────────────

export class DynamoRivalriesRepository implements RivalriesRepository {
  async get(rivalryId: string): Promise<Rivalry | undefined> {
    const result = await dynamoDb.query({
      TableName: TableNames.RIVALRIES,
      KeyConditionExpression: '#r = :rivalryId',
      ExpressionAttributeNames: { '#r': 'rivalryId' },
      ExpressionAttributeValues: { ':rivalryId': rivalryId },
    });
    const items = (result.Items ?? []) as Array<Record<string, unknown>>;
    if (items.length === 0) return undefined;
    const meta = items.find(isMetaRow) as MetaRow | undefined;
    if (!meta) return undefined;
    const participants = items.filter((row) => !isMetaRow(row)) as unknown as ParticipantRow[];
    return aggregateFromRows(meta, participants);
  }

  async listByParticipant(
    playerId: string,
    opts: ListPageOptions = {},
  ): Promise<ListPage<Rivalry>> {
    const result = await dynamoDb.query({
      TableName: TableNames.RIVALRIES,
      IndexName: 'ParticipantIndex',
      KeyConditionExpression: '#p = :playerId',
      ExpressionAttributeNames: { '#p': 'participantId' },
      ExpressionAttributeValues: { ':playerId': playerId },
      Limit: clampLimit(opts.limit),
      ExclusiveStartKey: decodeCursor(opts.cursor),
    });
    const ids = Array.from(
      new Set(((result.Items ?? []) as ParticipantRow[]).map((row) => row.rivalryId)),
    );
    const rivalries = await Promise.all(ids.map((id) => this.get(id)));
    return {
      items: rivalries.filter((r): r is Rivalry => !!r),
      nextCursor: encodeCursor(result.LastEvaluatedKey),
    };
  }

  async listByStatus(
    status: RivalryStatus,
    opts: ListPageOptions = {},
  ): Promise<ListPage<Rivalry>> {
    const result = await dynamoDb.query({
      TableName: TableNames.RIVALRIES,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#s = :status',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: false, // newest createdAt first
      Limit: clampLimit(opts.limit),
      ExclusiveStartKey: decodeCursor(opts.cursor),
    });
    const metas = (result.Items ?? []) as MetaRow[];
    const rivalries = await Promise.all(metas.map((m) => this.get(m.rivalryId)));
    return {
      items: rivalries.filter((r): r is Rivalry => !!r),
      nextCursor: encodeCursor(result.LastEvaluatedKey),
    };
  }

  async create(input: CreateRivalryInput): Promise<Rivalry> {
    const now = new Date().toISOString();
    const rivalryId = uuidv4();
    const meta: MetaRow = {
      rivalryId,
      recordType: 'META',
      title: input.title,
      description: input.description,
      status: 'pending',
      heat: input.heat ?? 'warm',
      requestedBy: input.requestedBy,
      createdAt: now,
      updatedAt: now,
    };
    const participantRows: ParticipantRow[] = input.participants.map((p) => ({
      rivalryId,
      recordType: participantSk(p.playerId),
      participantId: p.playerId,
      role: p.role ?? 'rival',
      addedAt: now,
    }));

    // Best-effort batch: serverless-offline / DynamoDB Local handle put well
    // enough for these volumes (typically 2–4 participants). Real cross-row
    // atomicity is provided by the UnitOfWork for create-with-participants.
    await dynamoDb.put({ TableName: TableNames.RIVALRIES, Item: meta });
    await Promise.all(
      participantRows.map((row) =>
        dynamoDb.put({ TableName: TableNames.RIVALRIES, Item: row }),
      ),
    );
    return aggregateFromRows(meta, participantRows);
  }

  async update(rivalryId: string, patch: RivalryPatch): Promise<Rivalry> {
    const now = new Date().toISOString();
    const sets: string[] = ['#updatedAt = :now'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':now': now };
    let i = 0;
    for (const [key, val] of Object.entries(patch)) {
      if (val === undefined) continue;
      const nameKey = `#f${i}`;
      const valKey = `:v${i}`;
      names[nameKey] = key;
      values[valKey] = val;
      sets.push(`${nameKey} = ${valKey}`);
      i++;
    }
    await dynamoDb.update({
      TableName: TableNames.RIVALRIES,
      Key: { rivalryId, recordType: RIVALRY_META_SK },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(rivalryId)',
    });
    const updated = await this.get(rivalryId);
    if (!updated) throw new Error(`Rivalry ${rivalryId} not found after update`);
    return updated;
  }

  async addParticipant(
    rivalryId: string,
    playerId: string,
    role: RivalryParticipantRole = 'rival',
  ): Promise<RivalryParticipant> {
    const addedAt = new Date().toISOString();
    const row: ParticipantRow = {
      rivalryId,
      recordType: participantSk(playerId),
      participantId: playerId,
      role,
      addedAt,
    };
    await dynamoDb.put({ TableName: TableNames.RIVALRIES, Item: row });
    return { playerId, role, addedAt };
  }

  async removeParticipant(rivalryId: string, playerId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.RIVALRIES,
      Key: { rivalryId, recordType: participantSk(playerId) },
    });
  }

  async delete(rivalryId: string): Promise<void> {
    const result = await dynamoDb.query({
      TableName: TableNames.RIVALRIES,
      KeyConditionExpression: '#r = :rivalryId',
      ExpressionAttributeNames: { '#r': 'rivalryId' },
      ExpressionAttributeValues: { ':rivalryId': rivalryId },
    });
    const rows = (result.Items ?? []) as Array<{ rivalryId: string; recordType: string }>;
    await Promise.all(
      rows.map((row) =>
        dynamoDb.delete({
          TableName: TableNames.RIVALRIES,
          Key: { rivalryId: row.rivalryId, recordType: row.recordType },
        }),
      ),
    );
  }
}

// ─── RivalryMessagesRepository ─────────────────────────────────────────

interface MessageRow {
  rivalryId: string;
  createdAtMessageId: string;
  messageId: string;
  authorPlayerId: string;
  body: string;
  audience: 'all' | 'participants' | 'admins';
  createdAt: string;
}

const buildMessageSk = (createdAt: string, messageId: string): string =>
  `${createdAt}#${messageId}`;

const toMessageDomain = (row: MessageRow): RivalryMessage => ({
  rivalryId: row.rivalryId,
  messageId: row.messageId,
  authorPlayerId: row.authorPlayerId,
  body: row.body,
  audience: row.audience,
  createdAt: row.createdAt,
});

export class DynamoRivalryMessagesRepository implements RivalryMessagesRepository {
  async list(
    rivalryId: string,
    opts: ListPageOptions = {},
  ): Promise<ListPage<RivalryMessage>> {
    const result = await dynamoDb.query({
      TableName: TableNames.RIVALRY_MESSAGES,
      KeyConditionExpression: '#r = :rivalryId',
      ExpressionAttributeNames: { '#r': 'rivalryId' },
      ExpressionAttributeValues: { ':rivalryId': rivalryId },
      ScanIndexForward: false, // newest first
      Limit: clampLimit(opts.limit),
      ExclusiveStartKey: decodeCursor(opts.cursor),
    });
    const items = (result.Items ?? []) as MessageRow[];
    return {
      items: items.map(toMessageDomain),
      nextCursor: encodeCursor(result.LastEvaluatedKey),
    };
  }

  async post(input: RivalryMessagePostInput): Promise<RivalryMessage> {
    const messageId = uuidv4();
    const createdAt = new Date().toISOString();
    const row: MessageRow = {
      rivalryId: input.rivalryId,
      createdAtMessageId: buildMessageSk(createdAt, messageId),
      messageId,
      authorPlayerId: input.authorPlayerId,
      body: input.body,
      audience: input.audience ?? 'all',
      createdAt,
    };
    await dynamoDb.put({ TableName: TableNames.RIVALRY_MESSAGES, Item: row });
    return toMessageDomain(row);
  }
}

// ─── RivalryNotesRepository ────────────────────────────────────────────

interface NoteRow {
  rivalryId: string;
  noteId: string;
  noteType: RivalryNoteType;
  visibility: 'all' | 'participants' | 'admins';
  body: string;
  authorPlayerId: string;
  createdAt: string;
  updatedAt: string;
}

const toNoteDomain = (row: NoteRow): RivalryNote => ({
  rivalryId: row.rivalryId,
  noteId: row.noteId,
  noteType: row.noteType,
  visibility: row.visibility,
  body: row.body,
  authorPlayerId: row.authorPlayerId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class DynamoRivalryNotesRepository implements RivalryNotesRepository {
  async listByRivalry(rivalryId: string): Promise<RivalryNote[]> {
    const items = (await dynamoDb.queryAll({
      TableName: TableNames.RIVALRY_NOTES,
      KeyConditionExpression: '#r = :rivalryId',
      ExpressionAttributeNames: { '#r': 'rivalryId' },
      ExpressionAttributeValues: { ':rivalryId': rivalryId },
    })) as unknown as NoteRow[];
    return items
      .map(toNoteDomain)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async listByType(
    noteType: RivalryNoteType,
    opts: ListPageOptions = {},
  ): Promise<ListPage<RivalryNote>> {
    const result = await dynamoDb.query({
      TableName: TableNames.RIVALRY_NOTES,
      IndexName: 'NoteTypeIndex',
      KeyConditionExpression: '#t = :noteType',
      ExpressionAttributeNames: { '#t': 'noteType' },
      ExpressionAttributeValues: { ':noteType': noteType },
      ScanIndexForward: false,
      Limit: clampLimit(opts.limit),
      ExclusiveStartKey: decodeCursor(opts.cursor),
    });
    const items = (result.Items ?? []) as NoteRow[];
    return {
      items: items.map(toNoteDomain),
      nextCursor: encodeCursor(result.LastEvaluatedKey),
    };
  }

  async create(input: RivalryNoteCreateInput): Promise<RivalryNote> {
    const now = new Date().toISOString();
    const row: NoteRow = {
      rivalryId: input.rivalryId,
      noteId: uuidv4(),
      noteType: input.noteType,
      visibility: input.visibility,
      body: input.body,
      authorPlayerId: input.authorPlayerId,
      createdAt: now,
      updatedAt: now,
    };
    await dynamoDb.put({ TableName: TableNames.RIVALRY_NOTES, Item: row });
    return toNoteDomain(row);
  }

  async update(
    rivalryId: string,
    noteId: string,
    patch: RivalryNotePatch,
  ): Promise<RivalryNote> {
    const now = new Date().toISOString();
    const sets: string[] = ['#updatedAt = :now'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':now': now };
    let i = 0;
    for (const [key, val] of Object.entries(patch)) {
      if (val === undefined) continue;
      const nameKey = `#f${i}`;
      const valKey = `:v${i}`;
      names[nameKey] = key;
      values[valKey] = val;
      sets.push(`${nameKey} = ${valKey}`);
      i++;
    }
    await dynamoDb.update({
      TableName: TableNames.RIVALRY_NOTES,
      Key: { rivalryId, noteId },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(noteId)',
    });
    const result = await dynamoDb.get({
      TableName: TableNames.RIVALRY_NOTES,
      Key: { rivalryId, noteId },
    });
    if (!result.Item) throw new Error(`Note ${noteId} not found after update`);
    return toNoteDomain(result.Item as NoteRow);
  }

  async delete(rivalryId: string, noteId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.RIVALRY_NOTES,
      Key: { rivalryId, noteId },
    });
  }
}
