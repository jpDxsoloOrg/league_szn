import { updateHandlerFactory } from '../../lib/handlers';
import { getRepositories } from '../../lib/repositories';
import type { DivisionPatch } from '../../lib/repositories/DivisionsRepository';
import type { Division } from '../../lib/repositories/types';

export const handler = updateHandlerFactory<DivisionPatch, Division>({
  repo: () => getRepositories().leagueOps.divisions,
  entityName: 'division',
  idParam: 'divisionId',
  patchFields: ['name', 'description'],
});
