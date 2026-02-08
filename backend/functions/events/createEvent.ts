import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';

interface CreateEventBody {
  name: string;
  eventType: 'ppv' | 'weekly' | 'special' | 'house';
  date: string;
  venue?: string;
  description?: string;
  imageUrl?: string;
  themeColor?: string;
  seasonId?: string;
  fantasyEnabled?: boolean;
  fantasyBudget?: number;
  fantasyPicksPerDivision?: number;
}

const VALID_EVENT_TYPES = ['ppv', 'weekly', 'special', 'house'];

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body: CreateEventBody = JSON.parse(event.body);

    if (!body.name || !body.eventType || !body.date) {
      return badRequest('Name, eventType, and date are required');
    }

    if (!VALID_EVENT_TYPES.includes(body.eventType)) {
      return badRequest('eventType must be one of: ppv, weekly, special, house');
    }

    const eventItem: Record<string, any> = {
      eventId: uuidv4(),
      name: body.name,
      eventType: body.eventType,
      date: body.date,
      venue: body.venue || null,
      description: body.description || null,
      imageUrl: body.imageUrl || null,
      themeColor: body.themeColor || null,
      status: 'upcoming',
      seasonId: body.seasonId || null,
      matchCards: [],
      attendance: null,
      rating: null,
      fantasyEnabled: true,
      fantasyBudget: body.fantasyBudget || null,
      fantasyPicksPerDivision: body.fantasyPicksPerDivision || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await dynamoDb.put({
      TableName: TableNames.EVENTS,
      Item: eventItem,
    });

    return created(eventItem);
  } catch (err) {
    console.error('Error creating event:', err);
    return serverError('Failed to create event');
  }
};
