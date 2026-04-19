import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
// Notifications intentionally not dispatched here while the challenge UI is hidden.

interface CreateChallengeBody {
  challengedId: string;
  matchType: string;
  stipulation?: string;
  championshipId?: string;
  message?: string;
  challengeMode?: 'singles' | 'tag_team';
  challengedTagTeamId?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can issue challenges');
    }

    const { data: body, error: parseError } = parseBody<CreateChallengeBody>(event);
    if (parseError) return parseError;
    const { challengedId, matchType, stipulation, championshipId, message, challengeMode, challengedTagTeamId } = body;

    if (!matchType) {
      return badRequest('matchType is required');
    }

    const { roster: { players, tagTeams }, user: { challenges } } = getRepositories();

    // Find the challenger's player record via their user sub
    const challengerPlayer = await players.findByUserId(auth.sub);
    if (!challengerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    const challengerId = challengerPlayer.playerId;

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiration

    if (challengeMode === 'tag_team') {
      // --- Tag Team Challenge Flow ---
      if (!challengedTagTeamId) {
        return badRequest('challengedTagTeamId is required for tag team challenges');
      }

      // Find challenger's active tag team
      const challengerTeams = await tagTeams.listByPlayer(challengerId);
      const challengerTagTeam = challengerTeams.find((tt) => tt.status === 'active');
      if (!challengerTagTeam) {
        return badRequest('You are not in an active tag team');
      }

      const challengedTeam = await tagTeams.findById(challengedTagTeamId);
      if (!challengedTeam) {
        return badRequest('Challenged tag team not found');
      }

      if (challengedTeam.status !== 'active') {
        return badRequest('Challenged tag team is not active');
      }

      if (challengerTagTeam.tagTeamId === challengedTagTeamId) {
        return badRequest('A tag team cannot challenge itself');
      }

      const challenge = await challenges.create({
        challengerId,
        challengedId: challengedTeam.player1Id,
        challengeMode: 'tag_team',
        challengerTagTeamId: challengerTagTeam.tagTeamId,
        challengedTagTeamId,
        matchType,
        stipulation: stipulation || undefined,
        championshipId: championshipId || undefined,
        message: message || undefined,
        expiresAt: expiresAt.toISOString(),
      });

      // Notification dispatch intentionally disabled while the challenge UI is hidden.
      // The challenge row is still persisted so direct API calls keep working.
      return created(challenge);
    }

    // --- Singles Challenge Flow (default) ---
    if (!challengedId) {
      return badRequest('challengedId is required');
    }

    if (challengerId === challengedId) {
      return badRequest('You cannot challenge yourself');
    }

    // Verify the challenged player exists
    const challengedPlayer = await players.findById(challengedId);
    if (!challengedPlayer) {
      return badRequest('Challenged player not found');
    }

    const challenge = await challenges.create({
      challengerId,
      challengedId,
      matchType,
      stipulation: stipulation || undefined,
      championshipId: championshipId || undefined,
      message: message || undefined,
      expiresAt: expiresAt.toISOString(),
    });

    // Notification dispatch intentionally disabled while the challenge UI is hidden.
    return created(challenge);
  } catch (err) {
    console.error('Error creating challenge:', err);
    return serverError('Failed to create challenge');
  }
};
