import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';

interface MatchCardEntry {
  position: number;
  matchId: string;
  designation: string;
  notes?: string;
}

interface UpdateEventBody {
  name?: string;
  eventType?: 'ppv' | 'weekly' | 'special' | 'house';
  date?: string;
  venue?: string;
  description?: string;
  imageUrl?: string;
  themeColor?: string;
  status?: 'upcoming' | 'in-progress' | 'completed' | 'cancelled';
  seasonId?: string;
  matchCards?: MatchCardEntry[];
  attendance?: number;
  rating?: number;
  fantasyEnabled?: boolean;
  fantasyLocked?: boolean;
  fantasyBudget?: number;
  fantasyPicksPerDivision?: number;
}

const VALID_EVENT_TYPES = ['ppv', 'weekly', 'special', 'house'];
const VALID_STATUSES = ['upcoming', 'in-progress', 'completed', 'cancelled'];

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;

    if (!eventId) {
      return badRequest('Event ID is required');
    }

    if (!event.body) {
      return badRequest('Request body is required');
    }

    const body: UpdateEventBody = JSON.parse(event.body);

    // Check if event exists
    const existing = await dynamoDb.get({
      TableName: TableNames.EVENTS,
      Key: { eventId },
    });

    if (!existing.Item) {
      return notFound('Event not found');
    }

    // Validate eventType if provided
    if (body.eventType !== undefined && !VALID_EVENT_TYPES.includes(body.eventType)) {
      return badRequest('eventType must be one of: ppv, weekly, special, house');
    }

    // Validate status if provided
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return badRequest('status must be one of: upcoming, in-progress, completed, cancelled');
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (body.name !== undefined) {
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = body.name;
    }

    if (body.eventType !== undefined) {
      updateExpressions.push('#eventType = :eventType');
      expressionAttributeNames['#eventType'] = 'eventType';
      expressionAttributeValues[':eventType'] = body.eventType;
    }

    if (body.date !== undefined) {
      updateExpressions.push('#date = :date');
      expressionAttributeNames['#date'] = 'date';
      expressionAttributeValues[':date'] = body.date;
    }

    if (body.venue !== undefined) {
      updateExpressions.push('#venue = :venue');
      expressionAttributeNames['#venue'] = 'venue';
      expressionAttributeValues[':venue'] = body.venue;
    }

    if (body.description !== undefined) {
      updateExpressions.push('#description = :description');
      expressionAttributeNames['#description'] = 'description';
      expressionAttributeValues[':description'] = body.description;
    }

    if (body.imageUrl !== undefined) {
      updateExpressions.push('#imageUrl = :imageUrl');
      expressionAttributeNames['#imageUrl'] = 'imageUrl';
      expressionAttributeValues[':imageUrl'] = body.imageUrl;
    }

    if (body.themeColor !== undefined) {
      updateExpressions.push('#themeColor = :themeColor');
      expressionAttributeNames['#themeColor'] = 'themeColor';
      expressionAttributeValues[':themeColor'] = body.themeColor;
    }

    if (body.status !== undefined) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = body.status;
    }

    if (body.seasonId !== undefined) {
      updateExpressions.push('#seasonId = :seasonId');
      expressionAttributeNames['#seasonId'] = 'seasonId';
      expressionAttributeValues[':seasonId'] = body.seasonId;
    }

    if (body.matchCards !== undefined) {
      updateExpressions.push('#matchCards = :matchCards');
      expressionAttributeNames['#matchCards'] = 'matchCards';
      expressionAttributeValues[':matchCards'] = body.matchCards;
    }

    if (body.attendance !== undefined) {
      updateExpressions.push('#attendance = :attendance');
      expressionAttributeNames['#attendance'] = 'attendance';
      expressionAttributeValues[':attendance'] = body.attendance;
    }

    if (body.rating !== undefined) {
      updateExpressions.push('#rating = :rating');
      expressionAttributeNames['#rating'] = 'rating';
      expressionAttributeValues[':rating'] = body.rating;
    }

    if (body.fantasyEnabled !== undefined) {
      updateExpressions.push('#fantasyEnabled = :fantasyEnabled');
      expressionAttributeNames['#fantasyEnabled'] = 'fantasyEnabled';
      expressionAttributeValues[':fantasyEnabled'] = body.fantasyEnabled;
    }

    if (body.fantasyLocked !== undefined) {
      updateExpressions.push('#fantasyLocked = :fantasyLocked');
      expressionAttributeNames['#fantasyLocked'] = 'fantasyLocked';
      expressionAttributeValues[':fantasyLocked'] = body.fantasyLocked;
    }

    if (body.fantasyBudget !== undefined) {
      updateExpressions.push('#fantasyBudget = :fantasyBudget');
      expressionAttributeNames['#fantasyBudget'] = 'fantasyBudget';
      expressionAttributeValues[':fantasyBudget'] = body.fantasyBudget;
    }

    if (body.fantasyPicksPerDivision !== undefined) {
      updateExpressions.push('#fantasyPicksPerDivision = :fantasyPicksPerDivision');
      expressionAttributeNames['#fantasyPicksPerDivision'] = 'fantasyPicksPerDivision';
      expressionAttributeValues[':fantasyPicksPerDivision'] = body.fantasyPicksPerDivision;
    }

    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (updateExpressions.length === 1) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.EVENTS,
      Key: { eventId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating event:', err);
    return serverError('Failed to update event');
  }
};
