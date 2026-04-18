import { getRepositories } from '../../lib/repositories';
import type { ShowCreateInput } from '../../lib/repositories';
import { notFound } from '../../lib/response';
import { createHandlerFactory } from '../../lib/handlers';

export const handler = createHandlerFactory<ShowCreateInput, unknown>({
  repo: () => getRepositories().shows,
  entityName: 'show',
  requiredFields: ['name', 'companyId'],
  optionalFields: ['description', 'schedule', 'dayOfWeek', 'imageUrl'],
  validate: async (body) => {
    if (body.companyId) {
      const { companies } = getRepositories();
      const company = await companies.findById(body.companyId as string);
      if (!company) {
        return notFound(`Company ${body.companyId} not found`);
      }
    }
    return null;
  },
});
