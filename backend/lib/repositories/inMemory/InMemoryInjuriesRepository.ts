import { injuryRowId, type InjuriesRepository, type Injury } from '../injuries';

const newestFirst = (a: Injury, b: Injury): number => b.startedAt.localeCompare(a.startedAt);
const soonestReturnFirst = (a: Injury, b: Injury): number => a.returnsAt.localeCompare(b.returnsAt);

/** INJ-03: reads only; the unit of work writes `store`, keyed by `injuryRowId`. */
export class InMemoryInjuriesRepository implements InjuriesRepository {
  readonly store = new Map<string, Injury>();

  async get(playerId: string, startedAt: string): Promise<Injury | null> {
    const row = this.store.get(injuryRowId(playerId, startedAt));
    return row ? structuredClone(row) : null;
  }

  async findByInjuryId(playerId: string, injuryId: string): Promise<Injury | null> {
    const rows = await this.listByPlayer(playerId);
    return rows.find((row) => row.injuryId === injuryId) ?? null;
  }

  async listByPlayer(playerId: string): Promise<Injury[]> {
    return Array.from(this.store.values())
      .filter((row) => row.playerId === playerId)
      .sort(newestFirst)
      .map((row) => structuredClone(row));
  }

  async listOpen(): Promise<Injury[]> {
    return Array.from(this.store.values())
      .filter((row) => row.endedAt === undefined)
      .sort(soonestReturnFirst)
      .map((row) => structuredClone(row));
  }
}
