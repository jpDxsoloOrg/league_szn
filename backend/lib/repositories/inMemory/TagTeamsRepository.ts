import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  TagTeamCreateInput,
  TagTeamPatch,
  TagTeamsRepository,
} from '../TagTeamsRepository';
import type { TagTeam, TagTeamStatus } from '../types';

export class InMemoryTagTeamsRepository implements TagTeamsRepository {
  readonly store = new Map<string, TagTeam>();

  async findById(tagTeamId: string): Promise<TagTeam | null> {
    return this.store.get(tagTeamId) ?? null;
  }

  async list(): Promise<TagTeam[]> {
    const items = Array.from(this.store.values());
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return items;
  }

  async listByStatus(status: TagTeamStatus): Promise<TagTeam[]> {
    return Array.from(this.store.values()).filter(
      (t) => t.status === status,
    );
  }

  async listByPlayer(playerId: string): Promise<TagTeam[]> {
    const items = Array.from(this.store.values()).filter(
      (t) => t.player1Id === playerId || t.player2Id === playerId,
    );
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return items;
  }

  async create(input: TagTeamCreateInput): Promise<TagTeam> {
    const now = new Date().toISOString();
    const item: TagTeam = {
      tagTeamId: uuidv4(),
      name: input.name,
      player1Id: input.player1Id,
      player2Id: input.player2Id,
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      status: input.status ?? 'pending_partner',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(item.tagTeamId, item);
    return item;
  }

  async update(tagTeamId: string, patch: TagTeamPatch): Promise<TagTeam> {
    const existing = this.store.get(tagTeamId);
    if (!existing) throw new NotFoundError('TagTeam', tagTeamId);
    const updated: TagTeam = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(tagTeamId, updated);
    return updated;
  }

  async delete(tagTeamId: string): Promise<void> {
    this.store.delete(tagTeamId);
  }
}
