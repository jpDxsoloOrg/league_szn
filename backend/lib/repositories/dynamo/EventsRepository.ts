import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../dynamodb';
import { NotFoundError } from '../errors';
import type {
  EventCreateInput,
  EventPatch,
  EventsRepository,
} from '../EventsRepository';
import type { LeagueEvent, EventStatus, EventCheckIn, EventCheckInStatus } from '../types';
import { buildUpdateExpression } from './util';

export class DynamoEventsRepository implements EventsRepository {
  // ─── Events ──────────────────────────────────────────────────────

  async findById(eventId: string): Promise<LeagueEvent | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.EVENTS,
      Key: { eventId },
    });
    return (result.Item as LeagueEvent | undefined) ?? null;
  }

  async list(): Promise<LeagueEvent[]> {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.EVENTS,
    });
    const events = items as unknown as LeagueEvent[];
    events.sort((a, b) => b.date.localeCompare(a.date));
    return events;
  }

  async listByStatus(status: EventStatus): Promise<LeagueEvent[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.EVENTS,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
      ScanIndexForward: false,
    });
    return items as unknown as LeagueEvent[];
  }

  async listBySeason(seasonId: string): Promise<LeagueEvent[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.EVENTS,
      IndexName: 'SeasonIndex',
      KeyConditionExpression: '#seasonId = :seasonId',
      ExpressionAttributeNames: { '#seasonId': 'seasonId' },
      ExpressionAttributeValues: { ':seasonId': seasonId },
      ScanIndexForward: false,
    });
    return items as unknown as LeagueEvent[];
  }

  async listByEventType(eventType: string): Promise<LeagueEvent[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.EVENTS,
      IndexName: 'DateIndex',
      KeyConditionExpression: '#eventType = :eventType',
      ExpressionAttributeNames: { '#eventType': 'eventType' },
      ExpressionAttributeValues: { ':eventType': eventType },
      ScanIndexForward: false,
    });
    return items as unknown as LeagueEvent[];
  }

  async listByDateRange(from: string, to: string): Promise<LeagueEvent[]> {
    // No single GSI covers arbitrary date ranges across all event types,
    // so we scan with a filter on the date attribute.
    const items = await dynamoDb.scanAll({
      TableName: TableNames.EVENTS,
      FilterExpression: '#date BETWEEN :from AND :to',
      ExpressionAttributeNames: { '#date': 'date' },
      ExpressionAttributeValues: { ':from': from, ':to': to },
    });
    const events = items as unknown as LeagueEvent[];
    events.sort((a, b) => b.date.localeCompare(a.date));
    return events;
  }

  async create(input: EventCreateInput): Promise<LeagueEvent> {
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
  }

  async update(eventId: string, patch: EventPatch): Promise<LeagueEvent> {
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
  }

  async delete(eventId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.EVENTS,
      Key: { eventId },
    });
  }

  // ─── Check-ins ───────────────────────────────────────────────────

  async getCheckIn(eventId: string, playerId: string): Promise<EventCheckIn | null> {
    const result = await dynamoDb.get({
      TableName: TableNames.EVENT_CHECK_INS,
      Key: { eventId, playerId },
    });
    return (result.Item as EventCheckIn | undefined) ?? null;
  }

  async listCheckIns(eventId: string): Promise<EventCheckIn[]> {
    const items = await dynamoDb.queryAll({
      TableName: TableNames.EVENT_CHECK_INS,
      KeyConditionExpression: 'eventId = :eid',
      ExpressionAttributeValues: { ':eid': eventId },
    });
    return items as unknown as EventCheckIn[];
  }

  async upsertCheckIn(
    eventId: string,
    playerId: string,
    status: EventCheckInStatus,
  ): Promise<EventCheckIn> {
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
  }

  async deleteCheckIn(eventId: string, playerId: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.EVENT_CHECK_INS,
      Key: { eventId, playerId },
    });
  }
}
