import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { parseBody } from '../../lib/parseBody';
import { badRequest, created, notFound, serverError } from '../../lib/response';
import type { EventCreateInput } from '../../lib/repositories/LeagueOpsRepository';
import type { Location } from '../../lib/repositories/types';

interface RawCreateEventBody {
  name?: unknown;
  eventType?: unknown;
  date?: unknown;
  venue?: unknown;
  locationId?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  themeColor?: unknown;
  seasonId?: unknown;
  companyIds?: unknown;
  showId?: unknown;
}

const VALID_EVENT_TYPES = ['ppv', 'weekly', 'special', 'house'] as const;
type ValidEventType = (typeof VALID_EVENT_TYPES)[number];

function isValidEventType(value: unknown): value is ValidEventType {
  return (
    typeof value === 'string' && (VALID_EVENT_TYPES as readonly string[]).includes(value)
  );
}

function denormalizeVenue(location: Location): string {
  return location.city ? `${location.name}, ${location.city}` : location.name;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody<RawCreateEventBody>(event);
    if (parseError) return parseError;

    const raw = body as RawCreateEventBody;

    if (!raw.name) return badRequest('name is required');
    if (!raw.eventType) return badRequest('eventType is required');
    if (!raw.date) return badRequest('date is required');

    if (!isValidEventType(raw.eventType)) {
      return badRequest('eventType must be one of ppv, weekly, special, or house');
    }

    if (raw.companyIds !== undefined) {
      if (!Array.isArray(raw.companyIds)) {
        return badRequest('companyIds must be an array of company IDs');
      }
      const { leagueOps: { companies } } = getRepositories();
      for (const companyId of raw.companyIds as string[]) {
        const company = await companies.findById(companyId);
        if (!company) {
          return notFound(`Company ${companyId} not found`);
        }
      }
    }

    const input: EventCreateInput = {
      name: raw.name as string,
      eventType: raw.eventType,
      date: raw.date as string,
    };
    if (raw.venue !== undefined) input.venue = raw.venue as string;
    if (raw.description !== undefined) input.description = raw.description as string;
    if (raw.imageUrl !== undefined) input.imageUrl = raw.imageUrl as string;
    if (raw.themeColor !== undefined) input.themeColor = raw.themeColor as string;
    if (raw.seasonId !== undefined) input.seasonId = raw.seasonId as string;
    if (raw.companyIds !== undefined) input.companyIds = raw.companyIds as string[];
    if (raw.showId !== undefined) input.showId = raw.showId as string;

    const { leagueOps: { events, locations } } = getRepositories();

    if (raw.venue !== undefined) {
      // Caller pinned a venue string — opt out of random-pick. Honor an
      // explicit locationId too, but do not denormalize over the caller's venue.
      if (raw.locationId !== undefined) {
        input.locationId = raw.locationId as string;
      }
    } else if (raw.locationId !== undefined) {
      const location = await locations.findById(raw.locationId as string);
      if (!location) {
        return notFound(`Location ${raw.locationId} not found`);
      }
      input.locationId = location.locationId;
      input.venue = denormalizeVenue(location);
    } else {
      const all = await locations.list();
      if (all.length > 0) {
        const picked = pickRandom(all);
        input.locationId = picked.locationId;
        input.venue = denormalizeVenue(picked);
      }
    }

    const item = await events.create(input);
    return created(item);
  } catch (err) {
    console.error('Error creating event:', err);
    return serverError('Failed to create event');
  }
};
