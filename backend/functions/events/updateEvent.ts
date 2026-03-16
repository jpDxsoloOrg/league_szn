import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { buildUpdateExpression, getOrNotFound } from '../../lib/dynamodbUtils';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

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
  companyIds?: string[];
  showId?: string;
}

const VALID_EVENT_TYPES = ['ppv', 'weekly', 'special', 'house'];
const VALID_STATUSES = ['upcoming', 'in-progress', 'completed', 'cancelled'];

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventId = event.pathParameters?.eventId;

    if (!eventId) {
      return badRequest('Event ID is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateEventBody>(event);
    if (parseError) return parseError;

    const eventResult = await getOrNotFound(TableNames.EVENTS, { eventId }, 'Event not found');
    if ('notFoundResponse' in eventResult) {
      return eventResult.notFoundResponse;
    }

    // Validate eventType if provided
    if (body.eventType !== undefined && !VALID_EVENT_TYPES.includes(body.eventType)) {
      return badRequest('eventType must be one of: ppv, weekly, special, house');
    }

    // Validate status if provided
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return badRequest('status must be one of: upcoming, in-progress, completed, cancelled');
    }

    // Validate companyIds if provided
    if (body.companyIds !== undefined) {
      if (!Array.isArray(body.companyIds)) {
        return badRequest('companyIds must be an array of company IDs');
      }
      for (const companyId of body.companyIds) {
        const companyResult = await dynamoDb.get({
          TableName: TableNames.COMPANIES,
          Key: { companyId },
        });
        if (!companyResult.Item) {
          return notFound(`Company ${companyId} not found`);
        }
      }
    }

    const updateExpr = buildUpdateExpression({
      name: body.name,
      eventType: body.eventType,
      date: body.date,
      venue: body.venue,
      description: body.description,
      imageUrl: body.imageUrl,
      themeColor: body.themeColor,
      status: body.status,
      seasonId: body.seasonId,
      matchCards: body.matchCards,
      attendance: body.attendance,
      rating: body.rating,
      fantasyEnabled: body.fantasyEnabled,
      fantasyLocked: body.fantasyLocked,
      fantasyBudget: body.fantasyBudget,
      fantasyPicksPerDivision: body.fantasyPicksPerDivision,
      companyIds: body.companyIds,
      showId: body.showId,
    });

    if (!updateExpr.hasChanges) {
      return badRequest('No valid fields to update');
    }

    const result = await dynamoDb.update({
      TableName: TableNames.EVENTS,
      Key: { eventId },
      UpdateExpression: updateExpr.UpdateExpression,
      ExpressionAttributeNames: updateExpr.ExpressionAttributeNames,
      ExpressionAttributeValues: updateExpr.ExpressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return success(result.Attributes);
  } catch (err) {
    console.error('Error updating event:', err);
    return serverError('Failed to update event');
  }
};
