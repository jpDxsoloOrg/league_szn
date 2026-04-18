import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotification } from '../../lib/notifications';

interface CreateTagTeamBody {
  name: string;
  partnerId: string;
  imageUrl?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can create tag teams');
    }

    const { data: body, error: parseError } = parseBody<CreateTagTeamBody>(event);
    if (parseError) return parseError;
    const { name, partnerId, imageUrl } = body;

    if (!name || !partnerId) {
      return badRequest('name and partnerId are required');
    }

    const { players: playersRepo, tagTeams: tagTeamsRepo } = getRepositories();

    // Find the caller's player record via their user sub
    const callerPlayer = await playersRepo.findByUserId(auth.sub);
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    // Verify caller doesn't already have a tag team
    if (callerPlayer.tagTeamId) {
      return badRequest('You are already in a tag team');
    }

    // Verify caller is not trying to team with themselves
    if (callerPlayer.playerId === partnerId) {
      return badRequest('You cannot form a tag team with yourself');
    }

    // Verify partner exists
    const partnerPlayer = await playersRepo.findById(partnerId);
    if (!partnerPlayer) {
      return badRequest('Partner player not found');
    }

    // Verify partner doesn't already have a tag team
    if (partnerPlayer.tagTeamId) {
      return badRequest('Partner is already in a tag team');
    }

    const tagTeam = await tagTeamsRepo.create({
      name,
      player1Id: callerPlayer.playerId,
      player2Id: partnerId,
      imageUrl: imageUrl || undefined,
      status: 'pending_partner',
    });

    // Notify the partner about the tag team invitation
    if (partnerPlayer.userId) {
      await createNotification({
        userId: partnerPlayer.userId,
        type: 'tag_team_invitation',
        message: `${callerPlayer.name} wants to form a tag team: ${name}`,
        sourceId: tagTeam.tagTeamId,
        sourceType: 'tag_team',
      });
    }

    return created(tagTeam);
  } catch (err) {
    console.error('Error creating tag team:', err);
    return serverError('Failed to create tag team');
  }
};
