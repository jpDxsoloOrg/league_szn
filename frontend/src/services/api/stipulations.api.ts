import type { Stipulation } from '../../types';
import { createCrudApi } from './crudFactory';

const baseStipulationsApi = createCrudApi<Stipulation, { name: string; description?: string }>('stipulations');

export const stipulationsApi = {
  getAll: async (signal?: AbortSignal): Promise<Stipulation[]> => {
    return baseStipulationsApi.getAll(signal);
  },

  create: async (stipulation: { name: string; description?: string }): Promise<Stipulation> => {
    return baseStipulationsApi.create(stipulation);
  },

  update: async (stipulationId: string, updates: Partial<Stipulation>): Promise<Stipulation> => {
    return baseStipulationsApi.updateById(stipulationId, updates);
  },

  delete: async (stipulationId: string): Promise<void> => {
    return baseStipulationsApi.deleteById(stipulationId);
  },
};
