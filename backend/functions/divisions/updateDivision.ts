import { updateHandlerFactory } from '../../lib/handlers';
import { updateDivision, validateDivisionFlags } from '../../lib/divisions';
import type { DivisionPatch } from '../../lib/repositories/LeagueOpsRepository';
import type { Division } from '../../lib/repositories/types';

export const handler = updateHandlerFactory<DivisionPatch, Division>({
  // updateDivision clears the previous default when this one takes the flag.
  repo: () => ({ update: updateDivision }),
  entityName: 'division',
  idParam: 'divisionId',
  patchFields: ['name', 'description', 'isDevelopmental', 'isDefaultForNewWrestlers'],
  validate: async (body) => validateDivisionFlags(body),
});
