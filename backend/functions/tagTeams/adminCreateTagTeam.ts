import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../../lib/repositories';
import type { Player, TagTeam } from '../../lib/repositories';
import { isConcurrentWriteError } from '../../lib/repositories/errors';
import { created, badRequest, errorWithDetails, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotifications, type CreateNotificationParams } from '../../lib/notifications';
import { firstBookingRefusal } from '../../lib/disciplineGates';
import { realWrestlerName } from '../../lib/needsWrestler';

/** Reason stored on pending requests closed by a GM-created team. */
export const SUPERSEDED_REASON = 'Superseded by GM-created team';

interface AdminCreateTagTeamBody {
  name?: unknown;
  player1Id?: unknown;
  player2Id?: unknown;
  imageUrl?: unknown;
  notifyPlayers?: unknown;
}

interface ValidatedBody {
  name: string;
  player1Id: string;
  player2Id: string;
  imageUrl?: string;
  notifyPlayers: boolean;
}

const PENDING_STATUSES: ReadonlySet<TagTeam['status']> = new Set(['pending_partner', 'pending_admin']);

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function validateBody(body: AdminCreateTagTeamBody): ValidatedBody | string {
  const name = nonEmptyString(body.name);
  const player1Id = nonEmptyString(body.player1Id);
  const player2Id = nonEmptyString(body.player2Id);
  if (!name || !player1Id || !player2Id) {
    return 'name, player1Id and player2Id are required';
  }
  if (body.imageUrl !== undefined && body.imageUrl !== null && typeof body.imageUrl !== 'string') {
    return 'imageUrl must be a string';
  }
  if (body.notifyPlayers !== undefined && typeof body.notifyPlayers !== 'boolean') {
    return 'notifyPlayers must be a boolean';
  }
  if (player1Id === player2Id) {
    return 'A tag team needs two different players';
  }
  return {
    name,
    player1Id,
    player2Id,
    imageUrl: nonEmptyString(body.imageUrl),
    notifyPlayers: body.notifyPlayers !== false,
  };
}

/** The name a GM recognises: the wrestler persona, then the player's own name. */
function displayName(player: Player): string {
  return realWrestlerName(player.currentWrestler) ?? (player.name?.trim() || player.playerId);
}

function teamSummary(team: TagTeam): { tagTeamId: string; name: string } {
  return { tagTeamId: team.tagTeamId, name: team.name };
}

/**
 * POST /tag-teams/admin — a GM (Moderator+) forms an active tag team in one
 * step, skipping the partner-accept and admin-approve stages.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireRole(event, 'Moderator');
    if (roleError) return roleError;

    const { data: rawBody, error: parseError } = parseBody<AdminCreateTagTeamBody>(event);
    if (parseError) return parseError;
    if (typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return badRequest('Request body must be an object');
    }
    const validated = validateBody(rawBody);
    if (typeof validated === 'string') return badRequest(validated);
    const { name, player1Id, player2Id, imageUrl, notifyPlayers } = validated;

    const { roster: { players: playersRepo, tagTeams: tagTeamsRepo }, runInTransaction } = getRepositories();

    const [player1, player2] = await Promise.all([
      playersRepo.findById(player1Id),
      playersRepo.findById(player2Id),
    ]);
    for (const [playerId, player] of [[player1Id, player1], [player2Id, player2]] as const) {
      if (!player) {
        return errorWithDetails(404, `Player ${playerId} not found`, { code: 'PLAYER_NOT_FOUND', playerId });
      }
    }
    const members: [Player, Player] = [player1 as Player, player2 as Player];

    const memberBlocked = firstBookingRefusal(members);
    if (memberBlocked) return memberBlocked;

    const [player1Teams, player2Teams, activeTeams] = await Promise.all([
      tagTeamsRepo.listByPlayer(player1Id),
      tagTeamsRepo.listByPlayer(player2Id),
      tagTeamsRepo.listByStatus('active'),
    ]);
    const activeById = new Map(activeTeams.map((team) => [team.tagTeamId, team]));

    // Neither player may already be on an active team. Check both the team
    // rows and the player's own pointer, since either can be the one that's set.
    const teamsByMember: Array<[Player, TagTeam[]]> = [[members[0], player1Teams], [members[1], player2Teams]];
    for (const [player, teams] of teamsByMember) {
      const conflicting = teams.find((team) => team.status === 'active')
        ?? (player.tagTeamId ? activeById.get(player.tagTeamId) : undefined);
      if (conflicting) {
        return errorWithDetails(
          409,
          `${displayName(player)} is already in the active tag team "${conflicting.name}"`,
          { code: 'PLAYER_IN_ACTIVE_TAG_TEAM', playerId: player.playerId, conflictingTagTeam: teamSummary(conflicting) },
        );
      }
    }

    const normalizedName = name.toLowerCase();
    const nameClash = activeTeams.find((team) => team.name.trim().toLowerCase() === normalizedName);
    if (nameClash) {
      return errorWithDetails(
        409,
        `An active tag team is already named "${nameClash.name}"`,
        { code: 'TAG_TEAM_NAME_TAKEN', conflictingTagTeam: teamSummary(nameClash) },
      );
    }

    const supersededById = new Map<string, TagTeam>();
    for (const team of [...player1Teams, ...player2Teams]) {
      if (PENDING_STATUSES.has(team.status)) supersededById.set(team.tagTeamId, team);
    }
    const supersededTagTeamIds = [...supersededById.keys()];

    const now = new Date().toISOString();
    const player1WrestlerName = realWrestlerName(members[0].currentWrestler);
    const player2WrestlerName = realWrestlerName(members[1].currentWrestler);
    const tagTeam: TagTeam = {
      tagTeamId: uuidv4(),
      name,
      player1Id,
      player2Id,
      ...(player1WrestlerName !== undefined ? { player1WrestlerName } : {}),
      ...(player2WrestlerName !== undefined ? { player2WrestlerName } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      status: 'active',
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await runInTransaction(async (tx) => {
        tx.createTagTeam(tagTeam);
        for (const tagTeamId of supersededTagTeamIds) {
          tx.updateTagTeam(tagTeamId, {
            status: 'dissolved',
            dissolvedAt: now,
            rejectionReason: SUPERSEDED_REASON,
          });
        }
        for (const player of members) {
          if (player.tagTeamId) {
            // A leftover pointer to a team that is no longer active: overwrite it.
            // setPlayerTagTeamId would refuse, since it only writes an empty slot.
            tx.updatePlayer(player.playerId, { tagTeamId: tagTeam.tagTeamId });
          } else {
            tx.setPlayerTagTeamId(player.playerId, tagTeam.tagTeamId);
          }
        }
      });
    } catch (writeError) {
      if (!isConcurrentWriteError(writeError)) throw writeError;
      return errorWithDetails(
        409,
        'One of these players changed tag teams while this team was being created. Reload and try again.',
        { code: 'CONCURRENT_UPDATE' },
      );
    }

    if (notifyPlayers) {
      const notifications: CreateNotificationParams[] = [];
      const pairs: Array<[Player, Player]> = [[members[0], members[1]], [members[1], members[0]]];
      for (const [recipient, partner] of pairs) {
        if (!recipient.userId) continue;
        notifications.push({
          userId: recipient.userId,
          type: 'tag_team_formed',
          message: `You and ${displayName(partner)} are now the tag team "${name}"`,
          sourceId: tagTeam.tagTeamId,
          sourceType: 'tag_team',
        });
      }
      await createNotifications(notifications);
    }

    return created({ ...tagTeam, supersededTagTeamIds });
  } catch (err) {
    console.error('Error creating tag team as GM:', err);
    return serverError('Failed to create tag team');
  }
};
