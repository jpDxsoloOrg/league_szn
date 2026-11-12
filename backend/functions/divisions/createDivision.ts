import { createHandlerFactory } from '../../lib/handlers';
import { createDivision, validateDivisionFlags } from '../../lib/divisions';
import type { DivisionCreateInput } from '../../lib/repositories/LeagueOpsRepository';
import type { Division } from '../../lib/repositories/types';

export const handler = createHandlerFactory<DivisionCreateInput, Division>({
  // createDivision clears the previous default when the new one takes the flag.
  repo: () => ({ create: createDivision }),
  entityName: 'division',
  requiredFields: ['name'],
  optionalFields: ['description', 'isDevelopmental', 'isDefaultForNewWrestlers'],
  validate: async (body) => validateDivisionFlags(body),
});
