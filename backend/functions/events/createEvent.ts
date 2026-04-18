import { createHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import { badRequest, notFound } from '../../lib/response';
import type { EventCreateInput } from '../../lib/repositories/EventsRepository';
import type { LeagueEvent } from '../../lib/repositories/types';

export const handler = createHandlerFactory<EventCreateInput, LeagueEvent>({
  repo: () => getRepositories().events,
  entityName: 'event',
  requiredFields: ['name', 'eventType', 'date'],
  optionalFields: ['companyIds', 'showId', 'seasonId', 'venue', 'description', 'imageUrl', 'themeColor', 'fantasyBudget', 'fantasyPicksPerDivision', 'fantasyEnabled'],
  validate: async (body) => {
    if (body.eventType !== 'ppv' && body.eventType !== 'weekly' && body.eventType !== 'special' && body.eventType !== 'house') {
      return badRequest('eventType must be one of ppv, weekly, special, or house');
    }
    if (body.companyIds) {
      if (!Array.isArray(body.companyIds)) {
        return badRequest('companyIds must be an array of company IDs');
      }
      const { companies } = getRepositories();
      for (const companyId of body.companyIds as string[]) {
        const company = await companies.findById(companyId);
        if (!company) {
          return notFound(`Company ${companyId} not found`);
        }
      }
    }
    return null;
  },
});
