import type {
  OverallSubmitInput,
  OverallsRepository,
} from '../OverallsRepository';
import type { WrestlerOverall } from '../types';

export class InMemoryOverallsRepository implements OverallsRepository {
  readonly store = new Map<string, WrestlerOverall>();

  async findByPlayerId(playerId: string): Promise<WrestlerOverall | null> {
    return this.store.get(playerId) ?? null;
  }

  async listAll(): Promise<WrestlerOverall[]> {
    return Array.from(this.store.values());
  }

  async submit(input: OverallSubmitInput): Promise<WrestlerOverall> {
    const existing = this.store.get(input.playerId);
    const now = new Date().toISOString();

    const item: WrestlerOverall = {
      playerId: input.playerId,
      mainOverall: input.mainOverall,
      updatedAt: now,
      submittedAt: existing?.submittedAt ?? now,
    };

    if (input.alternateOverall !== undefined) {
      item.alternateOverall = input.alternateOverall;
    }

    this.store.set(input.playerId, item);
    return item;
  }
}
