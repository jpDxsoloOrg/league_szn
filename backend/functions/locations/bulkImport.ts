import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { LocationCreateInput } from '../../lib/repositories';
import { parseBody } from '../../lib/parseBody';
import { badRequest, serverError, success } from '../../lib/response';

interface RawLocationRow {
  name?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
  capacity?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  imageUrl?: unknown;
  notes?: unknown;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === 'number';
}

function validateRow(raw: RawLocationRow): LocationCreateInput | string {
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
    return 'name must be a non-empty string';
  }
  if (!isOptionalString(raw.city)) return 'city must be a string';
  if (!isOptionalString(raw.state)) return 'state must be a string';
  if (!isOptionalString(raw.country)) return 'country must be a string';
  if (!isOptionalNumber(raw.capacity)) return 'capacity must be a number';
  if (!isOptionalNumber(raw.latitude)) return 'latitude must be a number';
  if (!isOptionalNumber(raw.longitude)) return 'longitude must be a number';
  if (!isOptionalString(raw.imageUrl)) return 'imageUrl must be a string';
  if (!isOptionalString(raw.notes)) return 'notes must be a string';

  const input: LocationCreateInput = { name: raw.name };
  if (raw.city !== undefined) input.city = raw.city as string;
  if (raw.state !== undefined) input.state = raw.state as string;
  if (raw.country !== undefined) input.country = raw.country as string;
  if (raw.capacity !== undefined) input.capacity = raw.capacity as number;
  if (raw.latitude !== undefined) input.latitude = raw.latitude as number;
  if (raw.longitude !== undefined) input.longitude = raw.longitude as number;
  if (raw.imageUrl !== undefined) input.imageUrl = raw.imageUrl as string;
  if (raw.notes !== undefined) input.notes = raw.notes as string;
  return input;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const raw = body as Record<string, unknown>;
    const locationsRaw = raw.locations;
    if (!Array.isArray(locationsRaw)) {
      return badRequest('locations must be an array');
    }

    const validated: LocationCreateInput[] = [];
    for (let i = 0; i < locationsRaw.length; i++) {
      const entry = locationsRaw[i];
      if (entry === null || typeof entry !== 'object') {
        return badRequest(`row ${i}: must be an object`);
      }
      const result = validateRow(entry as RawLocationRow);
      if (typeof result === 'string') {
        return badRequest(`row ${i}: ${result}`);
      }
      validated.push(result);
    }

    const { leagueOps: { locations } } = getRepositories();
    const repoResult = await locations.bulkImport(validated);
    return success(repoResult);
  } catch (err) {
    console.error('Error bulk importing locations:', err);
    return serverError('Failed to bulk import locations');
  }
};
