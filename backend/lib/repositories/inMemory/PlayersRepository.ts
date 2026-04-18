import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  PlayerCreateInput,
  PlayerPatch,
  PlayersRepository,
} from '../PlayersRepository';
import type { Player } from '../types';

export class InMemoryPlayersRepository implements PlayersRepository {
  readonly store = new Map<string, Player>();

  async findById(playerId: string): Promise<Player | null> {
    return this.store.get(playerId) ?? null;
  }

  async findByUserId(userId: string): Promise<Player | null> {
    for (const player of this.store.values()) {
      if (player.userId === userId) {
        return player;
      }
    }
    return null;
  }

  async list(): Promise<Player[]> {
    return Array.from(this.store.values());
  }

  async create(input: PlayerCreateInput): Promise<Player> {
    const now = new Date().toISOString();
    const item: Player = {
      playerId: uuidv4(),
      name: input.name,
      currentWrestler: input.currentWrestler,
      ...(input.alternateWrestler !== undefined ? { alternateWrestler: input.alternateWrestler } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.psnId !== undefined ? { psnId: input.psnId } : {}),
      ...(input.divisionId !== undefined ? { divisionId: input.divisionId } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.alignment !== undefined ? { alignment: input.alignment } : {}),
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.playerId, item);
    return item;
  }

  async update(playerId: string, patch: PlayerPatch): Promise<Player> {
    const existing = this.store.get(playerId);
    if (!existing) throw new NotFoundError('Player', playerId);
    const updated: Player = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(playerId, updated);
    return updated;
  }

  async delete(playerId: string): Promise<void> {
    this.store.delete(playerId);
  }
}
