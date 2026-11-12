import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError, forbidden } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { findActiveNameClash, normalizeTagTeamName, tagTeamNameTaken } from './tagTeamNameConflict';

interface UpdateTagTeamBody {
  name?: unknown;
  imageUrl?: string;
  player1WrestlerName?: string;
  player2WrestlerName?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers or admins can update tag teams');
    }

    const tagTeamId = event.pathParameters?.tagTeamId;
    if (!tagTeamId) {
      return badRequest('tagTeamId is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateTagTeamBody>(event);
    if (parseError) return parseError;
    const { name, imageUrl, player1WrestlerName, player2WrestlerName } = body;

    const { roster: { tagTeams: tagTeamsRepo, players: playersRepo } } = getRepositories();

    // Get existing tag team
    const tagTeam = await tagTeamsRepo.findById(tagTeamId);
    if (!tagTeam) {
      return notFound('Tag team not found');
    }

    // Staff (Moderator and Admin) can edit any team, e.g. a storyline rebrand.
    // Anyone else must be one of its members.
    if (!hasRole(auth, 'Moderator')) {
      const callerPlayer = await playersRepo.findByUserId(auth.sub);
      if (!callerPlayer) {
        return badRequest('No player profile linked to your account');
      }

      if (
        callerPlayer.playerId !== tagTeam.player1Id &&
        callerPlayer.playerId !== tagTeam.player2Id
      ) {
        return forbidden('Only tag team members or staff can update this tag team');
      }
    }

    const updateFields: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return badRequest('name must be a non-empty string');
      }
      const trimmedName = name.trim();
      // Same rule as POST /tag-teams/admin. Only a real change is checked, so a
      // team that already shares a name can still change its image.
      if (normalizeTagTeamName(trimmedName) !== normalizeTagTeamName(tagTeam.name)) {
        const activeTeams = await tagTeamsRepo.listByStatus('active');
        const clash = findActiveNameClash(activeTeams, trimmedName, tagTeamId);
        if (clash) return tagTeamNameTaken(clash);
      }
      updateFields.name = trimmedName;
    }
    if (imageUrl !== undefined) updateFields.imageUrl = imageUrl;
    // Empty/whitespace input is treated as "leave unchanged" — read-side
    // falls back to player.currentWrestler when the override is unset.
    if (player1WrestlerName !== undefined && player1WrestlerName.trim() !== '') {
      updateFields.player1WrestlerName = player1WrestlerName.trim();
    }
    if (player2WrestlerName !== undefined && player2WrestlerName.trim() !== '') {
      updateFields.player2WrestlerName = player2WrestlerName.trim();
    }

    if (Object.keys(updateFields).length === 0) {
      return badRequest('No fields to update');
    }

    const updated = await tagTeamsRepo.update(tagTeamId, updateFields);

    return success(updated);
  } catch (err) {
    console.error('Error updating tag team:', err);
    return serverError('Failed to update tag team');
  }
};
