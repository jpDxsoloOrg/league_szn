import { v4 as uuidv4 } from 'uuid';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
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
  TagTeamStatus,
  StableStatus,
  StableInvitation,
  WrestlerCreateInput,
  WrestlerPromotion,
  WrestlerImportResult,
} from '../types';
import {
  WRESTLER_PROMOTIONS,
  OVERALL_CAP_MIN,
  OVERALL_CAP_MAX,
} from '../types';
import type { DB } from './schema';
import { getKyselyDb } from './db';
import {
  rowToPlayer,
  rowToTagTeam,
  rowToStable,
  rowToStableInvitation,
  rowToWrestler,
  rowToOverall,
  rowToTransfer,
} from './mappers';

// ─── patch → column helpers ─────────────────────────────────────────

function playerPatchToColumns(patch: PlayerPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.currentWrestler !== undefined) out.current_wrestler = patch.currentWrestler;
  if (patch.alternateWrestler !== undefined) out.alternate_wrestler = patch.alternateWrestler;
  if (patch.currentWrestlerId !== undefined) out.current_wrestler_id = patch.currentWrestlerId;
  if (patch.alternateWrestlerId !== undefined) out.alternate_wrestler_id = patch.alternateWrestlerId;
  if (patch.imageUrl !== undefined) out.image_url = patch.imageUrl;
  if (patch.psnId !== undefined) out.psn_id = patch.psnId;
  if (patch.divisionId !== undefined) out.division_id = patch.divisionId;
  if (patch.companyId !== undefined) out.company_id = patch.companyId;
  if (patch.stableId !== undefined) out.stable_id = patch.stableId;
  if (patch.tagTeamId !== undefined) out.tag_team_id = patch.tagTeamId;
  if (patch.alignment !== undefined) out.alignment = patch.alignment;
  if (patch.userId !== undefined) out.user_id = patch.userId;
  return out;
}

function tagTeamPatchToColumns(patch: TagTeamPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.imageUrl !== undefined) out.image_url = patch.imageUrl;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.wins !== undefined) out.wins = patch.wins;
  if (patch.losses !== undefined) out.losses = patch.losses;
  if (patch.draws !== undefined) out.draws = patch.draws;
  if (patch.dissolvedAt !== undefined) out.dissolved_at = patch.dissolvedAt;
  return out;
}

// ─── Repository ──────────────────────────────────────────────────────

export class PostgresRosterRepository implements RosterRepository {
  constructor(private readonly db: Kysely<DB> = getKyselyDb()) {}

  // ─── players ───────────────────────────────────────────────────────

  players: RosterRepository['players'] = {
    findById: async (playerId) => {
      const row = await this.db
        .selectFrom('players')
        .selectAll()
        .where('player_id', '=', playerId)
        .executeTakeFirst();
      return row ? rowToPlayer(row) : null;
    },

    list: async () => {
      const rows = await this.db.selectFrom('players').selectAll().execute();
      return rows.map(rowToPlayer);
    },

    create: async (input: PlayerCreateInput) => {
      // wins/losses/draws/created_at/updated_at have DB defaults.
      const row = await this.db
        .insertInto('players')
        .values({
          player_id: uuidv4(),
          name: input.name,
          current_wrestler: input.currentWrestler,
          alternate_wrestler: input.alternateWrestler ?? null,
          current_wrestler_id: input.currentWrestlerId ?? null,
          alternate_wrestler_id: input.alternateWrestlerId ?? null,
          image_url: input.imageUrl ?? null,
          psn_id: input.psnId ?? null,
          division_id: input.divisionId ?? null,
          company_id: input.companyId ?? null,
          alignment: input.alignment ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return rowToPlayer(row);
    },

    update: async (playerId, patch: PlayerPatch) => {
      const cols = playerPatchToColumns(patch);
      const row = await this.db
        .updateTable('players')
        .set({ ...cols, updated_at: sql`now()` })
        .where('player_id', '=', playerId)
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new NotFoundError('Player', playerId);
      return rowToPlayer(row);
    },

    delete: async (playerId) => {
      await this.db.deleteFrom('players').where('player_id', '=', playerId).execute();
    },

    findByUserId: async (userId) => {
      const row = await this.db
        .selectFrom('players')
        .selectAll()
        .where('user_id', '=', userId)
        .executeTakeFirst();
      return row ? rowToPlayer(row) : null;
    },
  };

  // ─── tagTeams ──────────────────────────────────────────────────────

  tagTeams: RosterRepository['tagTeams'] = {
    findById: async (tagTeamId) => {
      const row = await this.db
        .selectFrom('tag_teams')
        .selectAll()
        .where('tag_team_id', '=', tagTeamId)
        .executeTakeFirst();
      return row ? rowToTagTeam(row) : null;
    },

    list: async () => {
      const rows = await this.db
        .selectFrom('tag_teams')
        .selectAll()
        .orderBy('name', 'asc')
        .execute();
      return rows.map(rowToTagTeam);
    },

    create: async (input: TagTeamCreateInput) => {
      const row = await this.db
        .insertInto('tag_teams')
        .values({
          tag_team_id: uuidv4(),
          name: input.name,
          player1_id: input.player1Id,
          player2_id: input.player2Id,
          image_url: input.imageUrl ?? null,
          status: input.status ?? 'pending_partner',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return rowToTagTeam(row);
    },

    update: async (tagTeamId, patch: TagTeamPatch) => {
      const cols = tagTeamPatchToColumns(patch);
      const row = await this.db
        .updateTable('tag_teams')
        .set({ ...cols, updated_at: sql`now()` })
        .where('tag_team_id', '=', tagTeamId)
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new NotFoundError('TagTeam', tagTeamId);
      return rowToTagTeam(row);
    },

    delete: async (tagTeamId) => {
      await this.db.deleteFrom('tag_teams').where('tag_team_id', '=', tagTeamId).execute();
    },

    listByStatus: async (status: TagTeamStatus) => {
      const rows = await this.db
        .selectFrom('tag_teams')
        .selectAll()
        .where('status', '=', status)
        .orderBy('name', 'asc')
        .execute();
      return rows.map(rowToTagTeam);
    },

    listByPlayer: async (playerId) => {
      const rows = await this.db
        .selectFrom('tag_teams')
        .selectAll()
        .where((eb) =>
          eb.or([
            eb('player1_id', '=', playerId),
            eb('player2_id', '=', playerId),
          ]),
        )
        .orderBy('name', 'asc')
        .execute();
      return rows.map(rowToTagTeam);
    },
  };

  // ─── stables ───────────────────────────────────────────────────────

  private async loadStableMembers(stableIds: string[]): Promise<Map<string, string[]>> {
    if (stableIds.length === 0) return new Map();
    const rows = await this.db
      .selectFrom('stable_members')
      .select(['stable_id', 'player_id'])
      .where('stable_id', 'in', stableIds)
      .execute();
    const map = new Map<string, string[]>();
    for (const r of rows) {
      const arr = map.get(r.stable_id) ?? [];
      arr.push(r.player_id);
      map.set(r.stable_id, arr);
    }
    return map;
  }

  stables: RosterRepository['stables'] = {
    findById: async (stableId) => {
      const row = await this.db
        .selectFrom('stables')
        .selectAll()
        .where('stable_id', '=', stableId)
        .executeTakeFirst();
      if (!row) return null;
      const members = await this.loadStableMembers([stableId]);
      return rowToStable(row, members.get(stableId) ?? []);
    },

    list: async () => {
      const rows = await this.db.selectFrom('stables').selectAll().execute();
      const members = await this.loadStableMembers(rows.map((r) => r.stable_id));
      return rows.map((r) => rowToStable(r, members.get(r.stable_id) ?? []));
    },

    listByStatus: async (status: StableStatus) => {
      const rows = await this.db
        .selectFrom('stables')
        .selectAll()
        .where('status', '=', status)
        .execute();
      const members = await this.loadStableMembers(rows.map((r) => r.stable_id));
      return rows.map((r) => rowToStable(r, members.get(r.stable_id) ?? []));
    },

    findByPlayer: async (playerId) => {
      const row = await this.db
        .selectFrom('stables')
        .innerJoin('stable_members', 'stable_members.stable_id', 'stables.stable_id')
        .selectAll('stables')
        .where('stable_members.player_id', '=', playerId)
        .executeTakeFirst();
      if (!row) return null;
      const members = await this.loadStableMembers([row.stable_id]);
      return rowToStable(row, members.get(row.stable_id) ?? []);
    },

    create: async (input: StableCreateInput) => {
      const stableId = uuidv4();
      return this.db.transaction().execute(async (trx) => {
        const row = await trx
          .insertInto('stables')
          .values({
            stable_id: stableId,
            name: input.name,
            leader_id: input.leaderId,
            image_url: input.imageUrl ?? null,
            status: input.status ?? 'pending',
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        if (input.memberIds.length > 0) {
          await trx
            .insertInto('stable_members')
            .values(input.memberIds.map((pid) => ({ stable_id: stableId, player_id: pid })))
            .execute();
        }
        return rowToStable(row, input.memberIds);
      });
    },

    update: async (stableId, patch: StablePatch) => {
      return this.db.transaction().execute(async (trx) => {
        const cols: Record<string, unknown> = {};
        if (patch.name !== undefined) cols.name = patch.name;
        if (patch.leaderId !== undefined) cols.leader_id = patch.leaderId;
        if (patch.imageUrl !== undefined) cols.image_url = patch.imageUrl;
        if (patch.status !== undefined) cols.status = patch.status;
        if (patch.wins !== undefined) cols.wins = patch.wins;
        if (patch.losses !== undefined) cols.losses = patch.losses;
        if (patch.draws !== undefined) cols.draws = patch.draws;
        if (patch.disbandedAt !== undefined) cols.disbanded_at = patch.disbandedAt;

        const row = Object.keys(cols).length > 0
          ? await trx
              .updateTable('stables')
              .set({ ...cols, updated_at: sql`now()` })
              .where('stable_id', '=', stableId)
              .returningAll()
              .executeTakeFirst()
          : await trx
              .selectFrom('stables')
              .selectAll()
              .where('stable_id', '=', stableId)
              .executeTakeFirst();
        if (!row) throw new NotFoundError('Stable', stableId);

        let memberIds: string[];
        if (patch.memberIds !== undefined) {
          await trx
            .deleteFrom('stable_members')
            .where('stable_id', '=', stableId)
            .execute();
          if (patch.memberIds.length > 0) {
            await trx
              .insertInto('stable_members')
              .values(patch.memberIds.map((pid) => ({ stable_id: stableId, player_id: pid })))
              .execute();
          }
          memberIds = patch.memberIds;
        } else {
          const existingMembers = await trx
            .selectFrom('stable_members')
            .select('player_id')
            .where('stable_id', '=', stableId)
            .execute();
          memberIds = existingMembers.map((m) => m.player_id);
        }

        return rowToStable(row, memberIds);
      });
    },

    delete: async (stableId) => {
      await this.db.deleteFrom('stables').where('stable_id', '=', stableId).execute();
    },

    // Invitations

    findInvitationById: async (invitationId) => {
      const row = await this.db
        .selectFrom('stable_invitations')
        .selectAll()
        .where('invitation_id', '=', invitationId)
        .executeTakeFirst();
      return row ? rowToStableInvitation(row) : null;
    },

    listInvitationsByStable: async (stableId) => {
      const rows = await this.db
        .selectFrom('stable_invitations')
        .selectAll()
        .where('stable_id', '=', stableId)
        .orderBy('created_at', 'desc')
        .execute();
      return rows.map(rowToStableInvitation);
    },

    listInvitationsByPlayer: async (playerId) => {
      const rows = await this.db
        .selectFrom('stable_invitations')
        .selectAll()
        .where('invited_player_id', '=', playerId)
        .orderBy('created_at', 'desc')
        .execute();
      return rows.map(rowToStableInvitation);
    },

    listPendingInvitationsByPlayer: async (playerId) => {
      const rows = await this.db
        .selectFrom('stable_invitations')
        .selectAll()
        .where('invited_player_id', '=', playerId)
        .where('status', '=', 'pending')
        .orderBy('created_at', 'desc')
        .execute();
      return rows.map(rowToStableInvitation);
    },

    createInvitation: async (input: StableInvitationCreateInput) => {
      const row = await this.db
        .insertInto('stable_invitations')
        .values({
          invitation_id: uuidv4(),
          stable_id: input.stableId,
          invited_player_id: input.invitedPlayerId,
          invited_by_player_id: input.invitedByPlayerId,
          message: input.message ?? null,
          expires_at: input.expiresAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return rowToStableInvitation(row);
    },

    updateInvitation: async (invitationId, patch: Partial<StableInvitation>) => {
      const cols: Record<string, unknown> = {};
      if (patch.status !== undefined) cols.status = patch.status;
      if (patch.message !== undefined) cols.message = patch.message;
      if (patch.expiresAt !== undefined) cols.expires_at = patch.expiresAt;
      const row = await this.db
        .updateTable('stable_invitations')
        .set({ ...cols, updated_at: sql`now()` })
        .where('invitation_id', '=', invitationId)
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new NotFoundError('StableInvitation', invitationId);
      return rowToStableInvitation(row);
    },

    deleteInvitation: async (invitationId) => {
      await this.db
        .deleteFrom('stable_invitations')
        .where('invitation_id', '=', invitationId)
        .execute();
    },

    deleteInvitationsByStable: async (stableId) => {
      await this.db
        .deleteFrom('stable_invitations')
        .where('stable_id', '=', stableId)
        .execute();
    },
  };

  // ─── overalls ──────────────────────────────────────────────────────

  overalls: RosterRepository['overalls'] = {
    findByPlayerId: async (playerId) => {
      const row = await this.db
        .selectFrom('wrestler_overalls')
        .selectAll()
        .where('player_id', '=', playerId)
        .executeTakeFirst();
      return row ? rowToOverall(row) : null;
    },

    listAll: async () => {
      const rows = await this.db.selectFrom('wrestler_overalls').selectAll().execute();
      return rows.map(rowToOverall);
    },

    submit: async (input: OverallSubmitInput) => {
      // Preserve original submittedAt on conflict; update the rest.
      const row = await this.db
        .insertInto('wrestler_overalls')
        .values({
          player_id: input.playerId,
          main_overall: input.mainOverall,
          alternate_overall: input.alternateOverall ?? null,
        })
        .onConflict((oc) =>
          oc.column('player_id').doUpdateSet({
            main_overall: input.mainOverall,
            alternate_overall: input.alternateOverall ?? null,
            updated_at: sql`now()`,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
      return rowToOverall(row);
    },
  };

  // ─── transfers ─────────────────────────────────────────────────────

  transfers: RosterRepository['transfers'] = {
    findById: async (requestId) => {
      const row = await this.db
        .selectFrom('transfer_requests')
        .selectAll()
        .where('request_id', '=', requestId)
        .executeTakeFirst();
      return row ? rowToTransfer(row) : null;
    },

    list: async () => {
      const rows = await this.db
        .selectFrom('transfer_requests')
        .selectAll()
        .orderBy('created_at', 'desc')
        .execute();
      return rows.map(rowToTransfer);
    },

    listByStatus: async (status: string) => {
      const rows = await this.db
        .selectFrom('transfer_requests')
        .selectAll()
        .where('status', '=', status as 'pending' | 'approved' | 'rejected')
        .orderBy('created_at', 'desc')
        .execute();
      return rows.map(rowToTransfer);
    },

    listByPlayer: async (playerId) => {
      const rows = await this.db
        .selectFrom('transfer_requests')
        .selectAll()
        .where('player_id', '=', playerId)
        .orderBy('created_at', 'desc')
        .execute();
      return rows.map(rowToTransfer);
    },

    listPendingByPlayer: async (playerId) => {
      const rows = await this.db
        .selectFrom('transfer_requests')
        .selectAll()
        .where('player_id', '=', playerId)
        .where('status', '=', 'pending')
        .execute();
      return rows.map(rowToTransfer);
    },

    create: async (input: TransferCreateInput) => {
      const row = await this.db
        .insertInto('transfer_requests')
        .values({
          request_id: uuidv4(),
          player_id: input.playerId,
          from_division_id: input.fromDivisionId,
          to_division_id: input.toDivisionId,
          reason: input.reason,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return rowToTransfer(row);
    },

    review: async (requestId, input: TransferReviewInput) => {
      const row = await this.db
        .updateTable('transfer_requests')
        .set({
          status: input.status,
          reviewed_by: input.reviewedBy,
          review_note: input.reviewNote ?? null,
          updated_at: sql`now()`,
        })
        .where('request_id', '=', requestId)
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new NotFoundError('TransferRequest', requestId);
      return rowToTransfer(row);
    },
  };

  // ─── wrestlers ─────────────────────────────────────────────────────

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
    findById: async (wrestlerId) => {
      const row = await this.db
        .selectFrom('wrestlers')
        .selectAll()
        .where('wrestler_id', '=', wrestlerId)
        .executeTakeFirst();
      return row ? rowToWrestler(row) : null;
    },

    list: async () => {
      const rows = await this.db
        .selectFrom('wrestlers')
        .selectAll()
        .orderBy('name', 'asc')
        .execute();
      return rows.map(rowToWrestler);
    },

    create: async (input: WrestlerCreateInput) => {
      const row = await this.db
        .insertInto('wrestlers')
        .values({
          wrestler_id: uuidv4(),
          promotion: input.promotion,
          name: input.name,
          overall_cap: input.overallCap,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return rowToWrestler(row);
    },

    update: async (wrestlerId, patch) => {
      const cols: Record<string, unknown> = {};
      if (patch.promotion !== undefined) cols.promotion = patch.promotion;
      if (patch.name !== undefined) cols.name = patch.name;
      if (patch.overallCap !== undefined) cols.overall_cap = patch.overallCap;
      if (patch.isInUse !== undefined) cols.is_in_use = patch.isInUse;
      if (patch.assignedPlayerId !== undefined) cols.assigned_player_id = patch.assignedPlayerId;
      if (patch.assignedSlot !== undefined) cols.assigned_slot = patch.assignedSlot;
      const row = await this.db
        .updateTable('wrestlers')
        .set({ ...cols, updated_at: sql`now()` })
        .where('wrestler_id', '=', wrestlerId)
        .returningAll()
        .executeTakeFirst();
      if (!row) throw new NotFoundError('Wrestler', wrestlerId);
      return rowToWrestler(row);
    },

    delete: async (wrestlerId) => {
      await this.db.deleteFrom('wrestlers').where('wrestler_id', '=', wrestlerId).execute();
    },

    listByPromotion: async (promotion: WrestlerPromotion) => {
      const rows = await this.db
        .selectFrom('wrestlers')
        .selectAll()
        .where('promotion', '=', promotion)
        .orderBy('name', 'asc')
        .execute();
      return rows.map(rowToWrestler);
    },

    listAvailable: async () => {
      const rows = await this.db
        .selectFrom('wrestlers')
        .selectAll()
        .where('is_in_use', '=', false)
        .orderBy('name', 'asc')
        .execute();
      return rows.map(rowToWrestler);
    },

    findByName: async (promotion: WrestlerPromotion, name: string) => {
      const row = await this.db
        .selectFrom('wrestlers')
        .selectAll()
        .where('promotion', '=', promotion)
        .where(sql`lower(name)`, '=', name.toLowerCase())
        .executeTakeFirst();
      return row ? rowToWrestler(row) : null;
    },

    bulkCreate: async (inputs: WrestlerCreateInput[]): Promise<WrestlerImportResult> => {
      const result: WrestlerImportResult = { created: 0, skipped: 0, errors: [] };
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
