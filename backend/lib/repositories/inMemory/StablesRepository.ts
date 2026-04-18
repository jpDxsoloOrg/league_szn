import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  StableCreateInput,
  StablePatch,
  StableInvitationCreateInput,
  StablesRepository,
} from '../StablesRepository';
import type { Stable, StableStatus, StableInvitation } from '../types';

export class InMemoryStablesRepository implements StablesRepository {
  readonly stables = new Map<string, Stable>();
  readonly invitations = new Map<string, StableInvitation>();

  // ─── Stables ─────────────────────────────────────────────────────

  async findById(stableId: string): Promise<Stable | null> {
    return this.stables.get(stableId) ?? null;
  }

  async list(): Promise<Stable[]> {
    return Array.from(this.stables.values());
  }

  async listByStatus(status: StableStatus): Promise<Stable[]> {
    return Array.from(this.stables.values()).filter((s) => s.status === status);
  }

  async findByPlayer(playerId: string): Promise<Stable | null> {
    for (const stable of this.stables.values()) {
      if (stable.memberIds.includes(playerId)) {
        return stable;
      }
    }
    return null;
  }

  async create(input: StableCreateInput): Promise<Stable> {
    const now = new Date().toISOString();
    const item: Stable = {
      stableId: uuidv4(),
      name: input.name,
      leaderId: input.leaderId,
      memberIds: input.memberIds,
      imageUrl: input.imageUrl,
      status: input.status ?? 'pending',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.stables.set(item.stableId, item);
    return item;
  }

  async update(stableId: string, patch: StablePatch): Promise<Stable> {
    const existing = this.stables.get(stableId);
    if (!existing) throw new NotFoundError('Stable', stableId);
    const updated: Stable = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    this.stables.set(stableId, updated);
    return updated;
  }

  async delete(stableId: string): Promise<void> {
    this.stables.delete(stableId);
  }

  // ─── Invitations ─────────────────────────────────────────────────

  async findInvitationById(invitationId: string): Promise<StableInvitation | null> {
    return this.invitations.get(invitationId) ?? null;
  }

  async listInvitationsByStable(stableId: string): Promise<StableInvitation[]> {
    return Array.from(this.invitations.values())
      .filter((inv) => inv.stableId === stableId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listInvitationsByPlayer(playerId: string): Promise<StableInvitation[]> {
    return Array.from(this.invitations.values())
      .filter((inv) => inv.invitedPlayerId === playerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listPendingInvitationsByPlayer(playerId: string): Promise<StableInvitation[]> {
    return Array.from(this.invitations.values())
      .filter((inv) => inv.invitedPlayerId === playerId && inv.status === 'pending')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createInvitation(input: StableInvitationCreateInput): Promise<StableInvitation> {
    const now = new Date().toISOString();
    const item: StableInvitation = {
      invitationId: uuidv4(),
      stableId: input.stableId,
      invitedPlayerId: input.invitedPlayerId,
      invitedByPlayerId: input.invitedByPlayerId,
      message: input.message,
      status: 'pending',
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    this.invitations.set(item.invitationId, item);
    return item;
  }

  async updateInvitation(
    invitationId: string,
    patch: Partial<StableInvitation>,
  ): Promise<StableInvitation> {
    const existing = this.invitations.get(invitationId);
    if (!existing) throw new NotFoundError('StableInvitation', invitationId);
    const updated: StableInvitation = {
      ...existing,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      updatedAt: new Date().toISOString(),
    };
    this.invitations.set(invitationId, updated);
    return updated;
  }
}
