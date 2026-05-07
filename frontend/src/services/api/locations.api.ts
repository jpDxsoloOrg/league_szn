import type {
  Location,
  CreateLocationInput,
  UpdateLocationInput,
  BulkImportResult,
} from '../../types/location';
import { API_BASE_URL, fetchWithAuth } from './apiClient';
import { createCrudApi } from './crudFactory';

const baseCrud = createCrudApi<Location, CreateLocationInput>('locations');

export const locationsApi = {
  list: async (signal?: AbortSignal): Promise<Location[]> => {
    return baseCrud.getAll(signal);
  },

  getById: async (locationId: string): Promise<Location> => {
    return fetchWithAuth(`${API_BASE_URL}/locations/${locationId}`);
  },

  create: async (input: CreateLocationInput): Promise<Location> => {
    return baseCrud.create(input);
  },

  update: async (locationId: string, patch: UpdateLocationInput): Promise<Location> => {
    return baseCrud.updateById(locationId, patch);
  },

  delete: async (locationId: string): Promise<void> => {
    return baseCrud.deleteById(locationId);
  },

  bulkImport: async (payload: { locations: CreateLocationInput[] }): Promise<BulkImportResult> => {
    return fetchWithAuth(`${API_BASE_URL}/locations/bulk`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
