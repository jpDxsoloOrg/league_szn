import { deleteHandlerFactory } from '../../lib/handlers';
import { ConflictError } from '../../lib/repositories/errors';
import { getRepositories } from '../../lib/repositories';
import type { Division } from '../../lib/repositories/types';

export const handler = deleteHandlerFactory<Division>({
  repo: () => getRepositories().divisions,
  entityName: 'division',
  idParam: 'divisionId',
  preDelete: async (divisionId) => {
    const { players } = getRepositories();
    const allPlayers = await players.list();
    const assignedPlayers = allPlayers.filter((p) => p.divisionId === divisionId);
    const count = assignedPlayers.length;
    if (count > 0) {
      throw new ConflictError(
        `Cannot delete division. ${count} player(s) are still assigned to this division.`,
      );
    }
  },
});
