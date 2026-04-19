import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import { buildUpdateExpression } from './util';
import { DynamoCrudRepository } from './DynamoCrudRepository';
import type {
  LeagueOpsRepository,
  EventCreateInput,
  EventPatch,
  ShowCreateInput,
  ShowPatch,
  CompanyCreateInput,
  CompanyPatch,
  DivisionCreateInput,
  DivisionPatch,
  MatchmakingMethods,
  PresenceRecord,
  QueueRecord,
  InvitationRecord,
} from '../LeagueOpsRepository';
import type {
  LeagueEvent,
  EventStatus,
  EventCheckIn,
  EventCheckInStatus,
  Show,
  Company,
  Division,
} from '../types';

export class DynamoLeagueOpsRepository implements LeagueOpsRepository {
  // ─── Companies (pure CRUD) ────────────────────────────────────────

  companies: LeagueOpsRepository['companies'] = new DynamoCrudRepository<
    Company,
    CompanyCreateInput,
    CompanyPatch
  >({
    tableName: TableNames.COMPANIES,
    idField: 'companyId',
    entityName: 'Company',
    buildItem: (input, id, now) => ({
      companyId: id,
      name: input.name,
      ...(input.abbreviation !== undefined ? { abbreviation: input.abbreviation } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAt: now,
      updatedAt: now,
    }),
  });

  // ─── Divisions (pure CRUD) ───────────────────────────────────────

  divisions: LeagueOpsRepository['divisions'] = new DynamoCrudRepository<
    Division,
    DivisionCreateInput,
    DivisionPatch
  >({
    tableName: TableNames.DIVISIONS,
    idField: 'divisionId',
    entityName: 'Division',
    buildItem: (input, id, now) => ({
      divisionId: id,
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      createdAt: now,
      updatedAt: now,
    }),
  });

  // ─── Shows (CRUD + listByCompany) ────────────────────────────────

  private _showsCrud = new DynamoCrudRepository<Show, ShowCreateInput, ShowPatch>({
    tableName: TableNames.SHOWS,
    idField: 'showId',
    entityName: 'Show',
    buildItem: (input, id, now) => ({
      showId: id,
      name: input.name,
      companyId: input.companyId,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.schedule !== undefined ? { schedule: input.schedule } : {}),
      ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      createdAt: now,
      updatedAt: now,
    }),
  });

  shows: LeagueOpsRepository['shows'] = {
    findById: (id: string) => this._showsCrud.findById(id),
    list: () => this._showsCrud.list(),
    create: (input: ShowCreateInput) => this._showsCrud.create(input),
    update: (id: string, patch: ShowPatch) => this._showsCrud.update(id, patch),
    delete: (id: string) => this._showsCrud.delete(id),

    listByCompany: async (companyId: string): Promise<Show[]> => {
      const result = await dynamoDb.query({
        TableName: TableNames.SHOWS,
        IndexName: 'CompanyShowsIndex',
        KeyConditionExpression: '#companyId = :companyId',
        ExpressionAttributeNames: { '#companyId': 'companyId' },
        ExpressionAttributeValues: { ':companyId': companyId },
      });
      const shows = (result.Items || []) as unknown as Show[];
      shows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return shows;
    },
  };

  // ─── Events (CRUD + query methods + check-ins) ───────────────────

  events: LeagueOpsRepository['events'] = {
    findById: async (eventId: string): Promise<LeagueEvent | null> => {
      const result = await dynamoDb.get({
        TableName: TableNames.EVENTS,
        Key: { eventId },
      });
      return (result.Item as LeagueEvent | undefined) ?? null;
    },

    list: async (): Promise<LeagueEvent[]> => {
      const items = await dynamoDb.scanAll({
        TableName: TableNames.EVENTS,
      });
      const events = items as unknown as LeagueEvent[];
      events.sort((a, b) => b.date.localeCompare(a.date));
      return events;
    },

    create: async (input: EventCreateInput): Promise<LeagueEvent> => {
      const now = new Date().toISOString();
      const item: LeagueEvent = {
        eventId: uuidv4(),
        name: input.name,
        eventType: input.eventType,
        date: input.date,
        venue: input.venue,
        description: input.description,
        imageUrl: input.imageUrl,
        themeColor: input.themeColor,
        status: 'upcoming',
        seasonId: input.seasonId,
        companyIds: input.companyIds,
        showId: input.showId,
        matchCards: [],
        fantasyEnabled: input.fantasyEnabled,
        fantasyBudget: input.fantasyBudget,
        fantasyPicksPerDivision: input.fantasyPicksPerDivision,
        createdAt: now,
        updatedAt: now,
      };
      await dynamoDb.put({ TableName: TableNames.EVENTS, Item: item });
      return item;
    },

    update: async (eventId: string, patch: EventPatch): Promise<LeagueEvent> => {
      const expr = buildUpdateExpression(patch, new Date().toISOString());
      const result = await dynamoDb
        .update({
          TableName: TableNames.EVENTS,
          Key: { eventId },
          UpdateExpression: expr.UpdateExpression,
          ExpressionAttributeNames: expr.ExpressionAttributeNames,
          ExpressionAttributeValues: expr.ExpressionAttributeValues,
          ConditionExpression: 'attribute_exists(eventId)',
          ReturnValues: 'ALL_NEW',
        })
        .catch((err: { name?: string }) => {
          if (err.name === 'ConditionalCheckFailedException') {
            throw new NotFoundError('Event', eventId);
          }
          throw err;
        });
      return result.Attributes as LeagueEvent;
    },

    delete: async (eventId: string): Promise<void> => {
      await dynamoDb.delete({
        TableName: TableNames.EVENTS,
        Key: { eventId },
      });
    },

    listByStatus: async (status: EventStatus): Promise<LeagueEvent[]> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.EVENTS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,
      });
      return items as unknown as LeagueEvent[];
    },

    listBySeason: async (seasonId: string): Promise<LeagueEvent[]> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.EVENTS,
        IndexName: 'SeasonIndex',
        KeyConditionExpression: '#seasonId = :seasonId',
        ExpressionAttributeNames: { '#seasonId': 'seasonId' },
        ExpressionAttributeValues: { ':seasonId': seasonId },
        ScanIndexForward: false,
      });
      return items as unknown as LeagueEvent[];
    },

    listByEventType: async (eventType: string): Promise<LeagueEvent[]> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.EVENTS,
        IndexName: 'DateIndex',
        KeyConditionExpression: '#eventType = :eventType',
        ExpressionAttributeNames: { '#eventType': 'eventType' },
        ExpressionAttributeValues: { ':eventType': eventType },
        ScanIndexForward: false,
      });
      return items as unknown as LeagueEvent[];
    },

    listByDateRange: async (from: string, to: string): Promise<LeagueEvent[]> => {
      const items = await dynamoDb.scanAll({
        TableName: TableNames.EVENTS,
        FilterExpression: '#date BETWEEN :from AND :to',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: { ':from': from, ':to': to },
      });
      const events = items as unknown as LeagueEvent[];
      events.sort((a, b) => b.date.localeCompare(a.date));
      return events;
    },

    // ─── Check-ins ───────────────────────────────────────────────────

    getCheckIn: async (eventId: string, playerId: string): Promise<EventCheckIn | null> => {
      const result = await dynamoDb.get({
        TableName: TableNames.EVENT_CHECK_INS,
        Key: { eventId, playerId },
      });
      return (result.Item as EventCheckIn | undefined) ?? null;
    },

    listCheckIns: async (eventId: string): Promise<EventCheckIn[]> => {
      const items = await dynamoDb.queryAll({
        TableName: TableNames.EVENT_CHECK_INS,
        KeyConditionExpression: 'eventId = :eid',
        ExpressionAttributeValues: { ':eid': eventId },
      });
      return items as unknown as EventCheckIn[];
    },

    upsertCheckIn: async (
      eventId: string,
      playerId: string,
      status: EventCheckInStatus,
    ): Promise<EventCheckIn> => {
      const now = new Date().toISOString();
      const item: EventCheckIn = {
        eventId,
        playerId,
        status,
        checkedInAt: now,
      };
      await dynamoDb.put({
        TableName: TableNames.EVENT_CHECK_INS,
        Item: item,
      });
      return item;
    },

    deleteCheckIn: async (eventId: string, playerId: string): Promise<void> => {
      await dynamoDb.delete({
        TableName: TableNames.EVENT_CHECK_INS,
        Key: { eventId, playerId },
      });
    },
  };

  // ─── Matchmaking (direct implementation) ─────────────────────────

  matchmaking: MatchmakingMethods = {
    // ── Presence ────────────────────────────────────────────────────

    putPresence: async (record: PresenceRecord): Promise<void> => {
      await dynamoDb.put({ TableName: TableNames.PRESENCE, Item: record });
    },

    getPresence: async (playerId: string): Promise<PresenceRecord | null> => {
      const result = await dynamoDb.get({
        TableName: TableNames.PRESENCE,
        Key: { playerId },
      });
      return (result.Item as PresenceRecord | undefined) ?? null;
    },

    listPresence: async (): Promise<PresenceRecord[]> => {
      return (await dynamoDb.scanAll({
        TableName: TableNames.PRESENCE,
      })) as unknown as PresenceRecord[];
    },

    deletePresence: async (playerId: string): Promise<void> => {
      await dynamoDb.delete({ TableName: TableNames.PRESENCE, Key: { playerId } });
    },

    // ── Queue ───────────────────────────────────────────────────────

    putQueue: async (record: QueueRecord): Promise<void> => {
      await dynamoDb.put({ TableName: TableNames.MATCHMAKING_QUEUE, Item: record });
    },

    listQueue: async (): Promise<QueueRecord[]> => {
      return (await dynamoDb.scanAll({
        TableName: TableNames.MATCHMAKING_QUEUE,
      })) as unknown as QueueRecord[];
    },

    deleteQueue: async (playerId: string): Promise<void> => {
      await dynamoDb.delete({ TableName: TableNames.MATCHMAKING_QUEUE, Key: { playerId } });
    },

    // ── Invitations ─────────────────────────────────────────────────

    putInvitation: async (record: InvitationRecord): Promise<void> => {
      await dynamoDb.put({ TableName: TableNames.MATCH_INVITATIONS, Item: record });
    },

    getInvitation: async (invitationId: string): Promise<InvitationRecord | null> => {
      const result = await dynamoDb.get({
        TableName: TableNames.MATCH_INVITATIONS,
        Key: { invitationId },
      });
      return (result.Item as InvitationRecord | undefined) ?? null;
    },

    listInvitationsByToPlayer: async (toPlayerId: string): Promise<InvitationRecord[]> => {
      const result = await dynamoDb.query({
        TableName: TableNames.MATCH_INVITATIONS,
        IndexName: 'ToPlayerIndex',
        KeyConditionExpression: 'toPlayerId = :pid',
        ExpressionAttributeValues: { ':pid': toPlayerId },
      });
      return (result.Items ?? []) as unknown as InvitationRecord[];
    },

    listInvitationsByFromPlayer: async (fromPlayerId: string): Promise<InvitationRecord[]> => {
      const result = await dynamoDb.query({
        TableName: TableNames.MATCH_INVITATIONS,
        IndexName: 'FromPlayerIndex',
        KeyConditionExpression: 'fromPlayerId = :pid',
        ExpressionAttributeValues: { ':pid': fromPlayerId },
      });
      return (result.Items ?? []) as unknown as InvitationRecord[];
    },

    updateInvitation: async (
      invitationId: string,
      patch: Record<string, unknown>,
      conditionStatus?: string,
    ): Promise<InvitationRecord> => {
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
        const existing = await this.matchmaking.getInvitation(invitationId);
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
    },
  };
}
