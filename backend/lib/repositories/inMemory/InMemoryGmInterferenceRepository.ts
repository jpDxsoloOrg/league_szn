import type {
  GmInterferenceListFilter,
  GmInterferenceRepository,
  GmInterferenceRequest,
} from '../gmInterference';

const newestFirst = (a: GmInterferenceRequest, b: GmInterferenceRequest): number =>
  b.createdAt.localeCompare(a.createdAt);

/** ECO-09: reads only; the unit of work writes `store`. */
export class InMemoryGmInterferenceRepository implements GmInterferenceRepository {
  readonly store = new Map<string, GmInterferenceRequest>();

  async findById(requestId: string): Promise<GmInterferenceRequest | null> {
    const row = this.store.get(requestId);
    return row ? { ...row } : null;
  }

  async listByPlayer(playerId: string): Promise<GmInterferenceRequest[]> {
    return Array.from(this.store.values())
      .filter((row) => row.playerId === playerId)
      .sort(newestFirst)
      .map((row) => ({ ...row }));
  }

  async list(filter: GmInterferenceListFilter = {}): Promise<GmInterferenceRequest[]> {
    return Array.from(this.store.values())
      .filter((row) => filter.status === undefined || row.status === filter.status)
      .sort(newestFirst)
      .map((row) => ({ ...row }));
  }
}
