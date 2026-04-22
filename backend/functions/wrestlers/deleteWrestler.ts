import { deleteHandlerFactory } from '../../lib/handlers';
import { ConflictError } from '../../lib/repositories/errors';
import { getRepositories } from '../../lib/repositories';
import type { Wrestler } from '../../lib/repositories/types';

export const handler = deleteHandlerFactory<Wrestler>({
  repo: () => getRepositories().roster.wrestlers,
  entityName: 'wrestler',
  idParam: 'wrestlerId',
  preDelete: async (_id, wrestler) => {
    if (wrestler.isInUse) {
      throw new ConflictError(
        'cannot delete a wrestler currently in use; release the assignment first',
      );
    }
  },
});
