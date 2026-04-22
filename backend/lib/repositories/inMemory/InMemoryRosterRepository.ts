import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../errors';
import type {
  RosterRepository,
  PlayerCreateInput,
  PlayerPatch,
  TagTeamCreateInput,
  TagTeamPatch,
  StableCreateInput,
  StablePatch,
  StableInvitationCreateInput,
  OverallSubmitInput,
  TransferCreateInput,
  TransferReviewInput,
} from '../RosterRepository';
import type {
  Player,
  TagTeam,
  TagTeamStatus,
  Stable,
  StableStatus,
  StableInvitation,
  WrestlerOverall,
  TransferRequest,
  Wrestler,
  WrestlerCreateInput,
  WrestlerPromotion,
  WrestlerImportResult,
} from '../types';
import {
  WRESTLER_PROMOTIONS,
  OVERALL_CAP_MIN,
  OVERALL_CAP_MAX,
} from '../types';

export class InMemoryRosterRepository implements RosterRepository {
  // ─── Exposed stores for InMemoryUnitOfWork wiring ───────────────────

  readonly playersStore = new Map<string, Player>();
  readonly tagTeamsStore = new Map<string, TagTeam>();
  readonly stablesStore = new Map<string, Stable>();
  readonly invitationsStore = new Map<string, StableInvitation>();
  readonly overallsStore = new Map<string, WrestlerOverall>();
  readonly transfersStore = new Map<string, TransferRequest>();
  readonly wrestlersStore = new Map<string, Wrestler>();

  // ─── players ────────────────────────────────────────────────────────

  players: RosterRepository['players'] = {
    findById: async (playerId: string): Promise<Player | null> => {
      return this.playersStore.get(playerId) ?? null;
    },

    list: async (): Promise<Player[]> => {
      return Array.from(this.playersStore.values());
    },

    create: async (input: PlayerCreateInput): Promise<Player> => {
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
      this.playersStore.set(item.playerId, item);
      return item;
    },

    update: async (playerId: string, patch: PlayerPatch): Promise<Player> => {
      const existing = this.playersStore.get(playerId);
      if (!existing) throw new NotFoundError('Player', playerId);
      const updated: Player = {
        ...existing,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        updatedAt: new Date().toISOString(),
      };
      this.playersStore.set(playerId, updated);
      return updated;
    },

    delete: async (playerId: string): Promise<void> => {
      this.playersStore.delete(playerId);
    },

    findByUserId: async (userId: string): Promise<Player | null> => {
      for (const player of this.playersStore.values()) {
        if (player.userId === userId) {
          return player;
        }
      }
      return null;
    },
  };

  // ─── tagTeams ───────────────────────────────────────────────────────

  tagTeams: RosterRepository['tagTeams'] = {
    findById: async (tagTeamId: string): Promise<TagTeam | null> => {
      return this.tagTeamsStore.get(tagTeamId) ?? null;
    },

    list: async (): Promise<TagTeam[]> => {
      const items = Array.from(this.tagTeamsStore.values());
      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return items;
    },

    create: async (input: TagTeamCreateInput): Promise<TagTeam> => {
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
      this.tagTeamsStore.set(item.tagTeamId, item);
      return item;
    },

    update: async (tagTeamId: string, patch: TagTeamPatch): Promise<TagTeam> => {
      const existing = this.tagTeamsStore.get(tagTeamId);
      if (!existing) throw new NotFoundError('TagTeam', tagTeamId);
      const updated: TagTeam = {
        ...existing,
        ...Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== undefined),
        ),
        updatedAt: new Date().toISOString(),
      };
      this.tagTeamsStore.set(tagTeamId, updated);
      return updated;
    },

    delete: async (tagTeamId: string): Promise<void> => {
      this.tagTeamsStore.delete(tagTeamId);
    },

    listByStatus: async (status: TagTeamStatus): Promise<TagTeam[]> => {
      return Array.from(this.tagTeamsStore.values()).filter(
        (t) => t.status === status,
      );
    },

    listByPlayer: async (playerId: string): Promise<TagTeam[]> => {
      const items = Array.from(this.tagTeamsStore.values()).filter(
        (t) => t.player1Id === playerId || t.player2Id === playerId,
      );
      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return items;
    },
  };

  // ─── stables ────────────────────────────────────────────────────────

  stables: RosterRepository['stables'] = {
    findById: async (stableId: string): Promise<Stable | null> => {
      return this.stablesStore.get(stableId) ?? null;
    },

    list: async (): Promise<Stable[]> => {
      return Array.from(this.stablesStore.values());
    },

    listByStatus: async (status: StableStatus): Promise<Stable[]> => {
      return Array.from(this.stablesStore.values()).filter((s) => s.status === status);
    },

    findByPlayer: async (playerId: string): Promise<Stable | null> => {
      for (const stable of this.stablesStore.values()) {
        if (stable.memberIds.includes(playerId)) {
          return stable;
        }
      }
      return null;
    },

    create: async (input: StableCreateInput): Promise<Stable> => {
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
      this.stablesStore.set(item.stableId, item);
      return item;
    },

    update: async (stableId: string, patch: StablePatch): Promise<Stable> => {
      const existing = this.stablesStore.get(stableId);
      if (!existing) throw new NotFoundError('Stable', stableId);
      const updated: Stable = {
        ...existing,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        updatedAt: new Date().toISOString(),
      };
      this.stablesStore.set(stableId, updated);
      return updated;
    },

    delete: async (stableId: string): Promise<void> => {
      this.stablesStore.delete(stableId);
    },

    // Invitations

    findInvitationById: async (invitationId: string): Promise<StableInvitation | null> => {
      return this.invitationsStore.get(invitationId) ?? null;
    },

    listInvitationsByStable: async (stableId: string): Promise<StableInvitation[]> => {
      return Array.from(this.invitationsStore.values())
        .filter((inv) => inv.stableId === stableId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    listInvitationsByPlayer: async (playerId: string): Promise<StableInvitation[]> => {
      return Array.from(this.invitationsStore.values())
        .filter((inv) => inv.invitedPlayerId === playerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    listPendingInvitationsByPlayer: async (playerId: string): Promise<StableInvitation[]> => {
      return Array.from(this.invitationsStore.values())
        .filter((inv) => inv.invitedPlayerId === playerId && inv.status === 'pending')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    createInvitation: async (input: StableInvitationCreateInput): Promise<StableInvitation> => {
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
      this.invitationsStore.set(item.invitationId, item);
      return item;
    },

    updateInvitation: async (
      invitationId: string,
      patch: Partial<StableInvitation>,
    ): Promise<StableInvitation> => {
      const existing = this.invitationsStore.get(invitationId);
      if (!existing) throw new NotFoundError('StableInvitation', invitationId);
      const updated: StableInvitation = {
        ...existing,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        updatedAt: new Date().toISOString(),
      };
      this.invitationsStore.set(invitationId, updated);
      return updated;
    },

    deleteInvitation: async (invitationId: string): Promise<void> => {
      this.invitationsStore.delete(invitationId);
    },

    deleteInvitationsByStable: async (stableId: string): Promise<void> => {
      for (const [id, inv] of this.invitationsStore) {
        if (inv.stableId === stableId) {
          this.invitationsStore.delete(id);
        }
      }
    },
  };

  // ─── overalls ───────────────────────────────────────────────────────

  overalls: RosterRepository['overalls'] = {
    findByPlayerId: async (playerId: string): Promise<WrestlerOverall | null> => {
      return this.overallsStore.get(playerId) ?? null;
    },

    listAll: async (): Promise<WrestlerOverall[]> => {
      return Array.from(this.overallsStore.values());
    },

    submit: async (input: OverallSubmitInput): Promise<WrestlerOverall> => {
      const existing = this.overallsStore.get(input.playerId);
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

      this.overallsStore.set(input.playerId, item);
      return item;
    },
  };

  // ─── transfers ──────────────────────────────────────────────────────

  transfers: RosterRepository['transfers'] = {
    findById: async (requestId: string): Promise<TransferRequest | null> => {
      return this.transfersStore.get(requestId) ?? null;
    },

    list: async (): Promise<TransferRequest[]> => {
      const items = Array.from(this.transfersStore.values());
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    },

    listByStatus: async (status: string): Promise<TransferRequest[]> => {
      const items = Array.from(this.transfersStore.values()).filter(
        (r) => r.status === status,
      );
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    },

    listByPlayer: async (playerId: string): Promise<TransferRequest[]> => {
      const items = Array.from(this.transfersStore.values()).filter(
        (r) => r.playerId === playerId,
      );
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    },

    listPendingByPlayer: async (playerId: string): Promise<TransferRequest[]> => {
      return Array.from(this.transfersStore.values()).filter(
        (r) => r.playerId === playerId && r.status === 'pending',
      );
    },

    create: async (input: TransferCreateInput): Promise<TransferRequest> => {
      const now = new Date().toISOString();
      const item: TransferRequest = {
        requestId: uuidv4(),
        playerId: input.playerId,
        fromDivisionId: input.fromDivisionId,
        toDivisionId: input.toDivisionId,
        reason: input.reason,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      this.transfersStore.set(item.requestId, item);
      return item;
    },

    review: async (
      requestId: string,
      input: TransferReviewInput,
    ): Promise<TransferRequest> => {
      const existing = this.transfersStore.get(requestId);
      if (!existing) throw new NotFoundError('TransferRequest', requestId);

      const now = new Date().toISOString();
      const updated: TransferRequest = {
        ...existing,
        status: input.status,
        reviewedBy: input.reviewedBy,
        updatedAt: now,
      };

      if (input.reviewNote) {
        updated.reviewNote = input.reviewNote;
      }

      this.transfersStore.set(requestId, updated);
      return updated;
    },
  };

  // ─── wrestlers ──────────────────────────────────────────────────────
  //
  // In-memory store uses a native boolean for isInUse. The dynamo
  // implementation persists it as a string due to the GSI constraint.

  private validateWrestlerInput(
    input: WrestlerCreateInput,
  ): { ok: true } | { ok: false; reason: string } {
    if (
      typeof input.promotion !== 'string' ||
      !(WRESTLER_PROMOTIONS as readonly string[]).includes(input.promotion)
    ) {
      return {
        ok: false,
        reason: `promotion must be one of: ${WRESTLER_PROMOTIONS.join(', ')}`,
      };
    }
    if (
      typeof input.name !== 'string' ||
      input.name.trim().length === 0 ||
      input.name.length > 128
    ) {
      return {
        ok: false,
        reason: 'name must be a non-empty string up to 128 chars',
      };
    }
    if (
      typeof input.overallCap !== 'number' ||
      !Number.isInteger(input.overallCap) ||
      input.overallCap < OVERALL_CAP_MIN ||
      input.overallCap > OVERALL_CAP_MAX
    ) {
      return {
        ok: false,
        reason: `overallCap must be an integer between ${OVERALL_CAP_MIN} and ${OVERALL_CAP_MAX}`,
      };
    }
    return { ok: true };
  }

  wrestlers: RosterRepository['wrestlers'] = {
    findById: async (wrestlerId: string): Promise<Wrestler | null> => {
      return this.wrestlersStore.get(wrestlerId) ?? null;
    },

    list: async (): Promise<Wrestler[]> => {
      const items = Array.from(this.wrestlersStore.values());
      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return items;
    },

    create: async (input: WrestlerCreateInput): Promise<Wrestler> => {
      const now = new Date().toISOString();
      const item: Wrestler = {
        wrestlerId: uuidv4(),
        promotion: input.promotion,
        name: input.name,
        overallCap: input.overallCap,
        isInUse: false,
        createdAt: now,
        updatedAt: now,
      };
      this.wrestlersStore.set(item.wrestlerId, item);
      return item;
    },

    update: async (wrestlerId, patch): Promise<Wrestler> => {
      const existing = this.wrestlersStore.get(wrestlerId);
      if (!existing) throw new NotFoundError('Wrestler', wrestlerId);
      const updated: Wrestler = {
        ...existing,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
        updatedAt: new Date().toISOString(),
      };
      this.wrestlersStore.set(wrestlerId, updated);
      return updated;
    },

    delete: async (wrestlerId: string): Promise<void> => {
      this.wrestlersStore.delete(wrestlerId);
    },

    listByPromotion: async (promotion: WrestlerPromotion): Promise<Wrestler[]> => {
      const items = Array.from(this.wrestlersStore.values()).filter(
        (w) => w.promotion === promotion,
      );
      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return items;
    },

    listAvailable: async (): Promise<Wrestler[]> => {
      const items = Array.from(this.wrestlersStore.values()).filter((w) => !w.isInUse);
      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return items;
    },

    findByName: async (
      promotion: WrestlerPromotion,
      name: string,
    ): Promise<Wrestler | null> => {
      const target = name.toLowerCase();
      for (const w of this.wrestlersStore.values()) {
        if (w.promotion === promotion && w.name.toLowerCase() === target) {
          return w;
        }
      }
      return null;
    },

    bulkCreate: async (
      inputs: WrestlerCreateInput[],
    ): Promise<WrestlerImportResult> => {
      const result: WrestlerImportResult = {
        created: 0,
        skipped: 0,
        errors: [],
      };

      const seenInPayload = new Set<string>();

      for (let row = 0; row < inputs.length; row++) {
        const input = inputs[row];
        const validation = this.validateWrestlerInput(input);
        if (!validation.ok) {
          result.errors.push({ row, reason: validation.reason });
          continue;
        }

        const key = `${input.promotion}::${input.name.toLowerCase()}`;
        if (seenInPayload.has(key)) {
          result.skipped += 1;
          result.errors.push({
            row,
            reason: 'duplicate within payload (same promotion + name, case-insensitive)',
          });
          continue;
        }

        const existing = await this.wrestlers.findByName(input.promotion, input.name);
        if (existing) {
          result.skipped += 1;
          result.errors.push({
            row,
            reason: 'a wrestler with this promotion + name already exists',
          });
          continue;
        }

        seenInPayload.add(key);
        await this.wrestlers.create(input);
        result.created += 1;
      }

      return result;
    },
  };
}
