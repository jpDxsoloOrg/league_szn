import { deleteHandlerFactory } from '../../lib/handlers';
import { ConflictError } from '../../lib/repositories/errors';
import { getRepositories } from '../../lib/repositories';
import type { Division } from '../../lib/repositories/types';

export const handler = deleteHandlerFactory<Division>({
  repo: () => getRepositories().leagueOps.divisions,
  entityName: 'division',
  idParam: 'divisionId',
  preDelete: async (divisionId) => {
    const { roster: { players }, competition: { championships } } = getRepositories();
    const allPlayers = await players.list();
    const assignedPlayers = allPlayers.filter((p) => p.divisionId === divisionId);
    const count = assignedPlayers.length;
    if (count > 0) {
      throw new ConflictError(
        `Cannot delete division. ${count} player(s) are still assigned to this division.`,
      );
    }

    // `divisionId` is not on the Championship type yet; scheduleMatch and
    // updateMatch read it the same way to enforce the division lock.
    const allChampionships = await championships.list();
    const lockedChampionships = allChampionships.filter(
      (championship) =>
        (championship as unknown as Record<string, unknown>).divisionId === divisionId,
    );
    if (lockedChampionships.length > 0) {
      const names = lockedChampionships.map((championship) => championship.name).join(', ');
      throw new ConflictError(
        `Cannot delete division. It is still assigned to championship(s): ${names}.`,
      );
    }
  },
});
