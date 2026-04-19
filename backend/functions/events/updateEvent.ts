import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { NotFoundError } from '../../lib/repositories/errors';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import type { EventPatch } from '../../lib/repositories/EventsRepository';

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
  matchCards?: EventPatch['matchCards'];
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

    const { leagueOps: { events, companies } } = getRepositories();

    const existing = await events.findById(eventId);
    if (!existing) {
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

    // Validate companyIds if provided
    if (body.companyIds !== undefined) {
      if (!Array.isArray(body.companyIds)) {
        return badRequest('companyIds must be an array of company IDs');
      }
      for (const companyId of body.companyIds) {
        const company = await companies.findById(companyId);
        if (!company) {
          return notFound(`Company ${companyId} not found`);
        }
      }
    }

    const patch: EventPatch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.eventType !== undefined) patch.eventType = body.eventType;
    if (body.date !== undefined) patch.date = body.date;
    if (body.venue !== undefined) patch.venue = body.venue;
    if (body.description !== undefined) patch.description = body.description;
    if (body.imageUrl !== undefined) patch.imageUrl = body.imageUrl;
    if (body.themeColor !== undefined) patch.themeColor = body.themeColor;
    if (body.status !== undefined) patch.status = body.status;
    if (body.seasonId !== undefined) patch.seasonId = body.seasonId;
    if (body.matchCards !== undefined) patch.matchCards = body.matchCards;
    if (body.attendance !== undefined) patch.attendance = body.attendance;
    if (body.rating !== undefined) patch.rating = body.rating;
    if (body.fantasyEnabled !== undefined) patch.fantasyEnabled = body.fantasyEnabled;
    if (body.fantasyLocked !== undefined) patch.fantasyLocked = body.fantasyLocked;
    if (body.fantasyBudget !== undefined) patch.fantasyBudget = body.fantasyBudget;
    if (body.fantasyPicksPerDivision !== undefined) patch.fantasyPicksPerDivision = body.fantasyPicksPerDivision;
    if (body.companyIds !== undefined) patch.companyIds = body.companyIds;
    if (body.showId !== undefined) patch.showId = body.showId;

    if (Object.keys(patch).length === 0) {
      return badRequest('No valid fields to update');
    }

    const updated = await events.update(eventId, patch);

    return success(updated);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return notFound('Event not found');
    }
    console.error('Error updating event:', err);
    return serverError('Failed to update event');
  }
};
