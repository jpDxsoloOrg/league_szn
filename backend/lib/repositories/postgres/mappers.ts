import type { Selectable } from 'kysely';
import type {
  Player,
  TagTeam,
  Stable,
  StableInvitation,
  Wrestler,
  WrestlerOverall,
  TransferRequest,
} from '../types';
import type {
  PlayersTable,
  TagTeamsTable,
  StablesTable,
  StableInvitationsTable,
  WrestlersTable,
  WrestlerOverallsTable,
  TransferRequestsTable,
} from './schema';

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function optional<K extends string, V>(key: K, value: V | null): Partial<Record<K, V>> {
  return value === null ? {} : ({ [key]: value } as Record<K, V>);
}

export function rowToPlayer(row: Selectable<PlayersTable>): Player {
  return {
    playerId: row.player_id,
    name: row.name,
    // `current_wrestler` is nullable in the real schema; the domain type
    // requires a string, so coerce null → '' at the boundary.
    currentWrestler: row.current_wrestler ?? '',
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...optional('userId', row.user_id),
    ...optional('alternateWrestler', row.alternate_wrestler),
    ...optional('currentWrestlerId', row.current_wrestler_id),
    ...optional('alternateWrestlerId', row.alternate_wrestler_id),
    ...optional('imageUrl', row.image_url),
    ...optional('psnId', row.psn_id),
    ...optional('divisionId', row.division_id),
    ...optional('companyId', row.company_id),
    ...optional('stableId', row.stable_id),
    ...optional('tagTeamId', row.tag_team_id),
    ...(row.alignment ? { alignment: row.alignment } : {}),
  };
}

export function rowToTagTeam(row: Selectable<TagTeamsTable>): TagTeam {
  return {
    tagTeamId: row.tag_team_id,
    name: row.name,
    player1Id: row.player1_id,
    player2Id: row.player2_id,
    status: row.status,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...optional('imageUrl', row.image_url),
    ...optional('dissolvedAt', row.dissolved_at),
  };
}

export function rowToStable(
  row: Selectable<StablesTable>,
  memberIds: string[],
): Stable {
  return {
    stableId: row.stable_id,
    name: row.name,
    leaderId: row.leader_id,
    memberIds,
    status: row.status,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...optional('imageUrl', row.image_url),
    ...optional('disbandedAt', row.disbanded_at),
  };
}

export function rowToStableInvitation(
  row: Selectable<StableInvitationsTable>,
): StableInvitation {
  return {
    invitationId: row.invitation_id,
    stableId: row.stable_id,
    invitedPlayerId: row.invited_player_id,
    invitedByPlayerId: row.invited_by_player_id,
    status: row.status,
    expiresAt: toIso(row.expires_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...optional('message', row.message),
  };
}

export function rowToWrestler(row: Selectable<WrestlersTable>): Wrestler {
  return {
    wrestlerId: row.wrestler_id,
    promotion: row.promotion,
    name: row.name,
    overallCap: row.overall_cap,
    isInUse: row.is_in_use,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...optional('assignedPlayerId', row.assigned_player_id),
    ...(row.assigned_slot ? { assignedSlot: row.assigned_slot } : {}),
  };
}

export function rowToOverall(
  row: Selectable<WrestlerOverallsTable>,
): WrestlerOverall {
  return {
    playerId: row.player_id,
    mainOverall: row.main_overall,
    submittedAt: toIso(row.submitted_at),
    updatedAt: toIso(row.updated_at),
    ...(row.alternate_overall !== null ? { alternateOverall: row.alternate_overall } : {}),
  };
}

export function rowToTransfer(
  row: Selectable<TransferRequestsTable>,
): TransferRequest {
  return {
    requestId: row.request_id,
    playerId: row.player_id,
    fromDivisionId: row.from_division_id,
    toDivisionId: row.to_division_id,
    reason: row.reason,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    ...optional('reviewedBy', row.reviewed_by),
    ...optional('reviewNote', row.review_note),
  };
}
