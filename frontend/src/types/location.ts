export interface Location {
  locationId: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  capacity?: number;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationInput {
  name: string;
  city?: string;
  state?: string;
  country?: string;
  capacity?: number;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  notes?: string;
}

export type UpdateLocationInput = Partial<CreateLocationInput>;

export interface BulkImportResult {
  created: number;
  skipped: number;
  skippedNames: string[];
}
