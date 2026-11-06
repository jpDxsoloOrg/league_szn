import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError, forbidden } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext, hasRole } from '../../lib/auth';
import { v4 as uuidv4 } from 'uuid';
import { challengeExpiresAt, isChallengeExpired } from '../../lib/challengeExpiry';
import { CHAMPIONSHIP_NOT_FOUND_MESSAGE, challengeTitleFitError, titleAvailabilityError } from '../../lib/challengeTitle';
import { isPlayerVisible, SET_WRESTLER_NAME_MESSAGE, TARGET_NEEDS_WRESTLER_MESSAGE } from '../../lib/needsWrestler';

type ChallengeAction = 'accept' | 'decline' | 'counter';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return forbidden('Only wrestlers can respond to challenges');
    }

    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId) {
      return badRequest('challengeId is required');
    }

    const { data: body, error: parseError } = parseBody<{
      action: ChallengeAction;
      responseMessage?: string;
      counterMatchType?: string;
      counterStipulation?: string;
      counterMessage?: string;
    }>(event);
    if (parseError) return parseError;

    const { action, responseMessage, counterMatchType, counterStipulation, counterMessage } = body;

    if (!action || !['accept', 'decline', 'counter'].includes(action)) {
      return badRequest('action must be accept, decline, or counter');
    }

    const { user: { challenges }, roster: { players, tagTeams }, competition: { championships } } = getRepositories();

    // Get the challenge via repo
    const challenge = await challenges.findById(challengeId);
    if (!challenge) {
      return notFound('Challenge not found');
    }

    if (challenge.status !== 'pending') {
      return badRequest('Challenge is no longer pending');
    }

    // Verify the responder is allowed to respond
    const responderPlayer = await players.findByUserId(auth.sub);
    if (!responderPlayer) {
      return forbidden('Only the challenged player can respond');
    }

    if (challenge.challengeMode === 'tag_team') {
      const tagTeam = challenge.challengedTagTeamId
        ? await tagTeams.findById(challenge.challengedTagTeamId)
        : null;
      if (!tagTeam || tagTeam.status !== 'active') {
        return badRequest('The challenged tag team has been dissolved');
      }
      if (responderPlayer.playerId !== tagTeam.player1Id && responderPlayer.playerId !== tagTeam.player2Id) {
        return forbidden('Only members of the challenged tag team can respond');
      }
    } else {
      if (responderPlayer.playerId !== challenge.challengedId) {
        return forbidden('Only the challenged player can respond');
      }
    }

    if (isChallengeExpired(challenge)) {
      return badRequest('Challenge expired');
    }

    const now = new Date().toISOString();

    if (action === 'accept' || action === 'decline') {
      const newStatus = action === 'accept' ? 'accepted' : 'declined';
      const patch: Record<string, unknown> = { status: newStatus };
      if (responseMessage) patch.responseMessage = responseMessage;

      await challenges.update(challengeId, patch);

      return success({ ...challenge, status: newStatus, responseMessage, updatedAt: now });
    }

    // Counter
    if (!counterMatchType) {
      return badRequest('counterMatchType is required when countering');
    }

    // A counter is a new challenge aimed at the original challenger, so both
    // ends follow the same rule as createChallenge. Accepting or declining
    // stays open, because neither one issues anything.
    if (!isPlayerVisible(responderPlayer)) {
      return badRequest(SET_WRESTLER_NAME_MESSAGE);
    }

    const counterTarget = await players.findById(challenge.challengerId);
    if (counterTarget && !isPlayerVisible(counterTarget)) {
      return badRequest(TARGET_NEEDS_WRESTLER_MESSAGE);
    }

    // A counter changes the terms, not the stakes, so a title stays on the line
    // and the new match type has to suit it.
    if (challenge.championshipId) {
      const championship = await championships.findById(challenge.championshipId);
      if (!championship) return badRequest(CHAMPIONSHIP_NOT_FOUND_MESSAGE);

      const isTagChallenge = challenge.challengeMode === 'tag_team';
      const teams = isTagChallenge
        ? await Promise.all([challenge.challengerTagTeamId, challenge.challengedTagTeamId].map((id) => (id ? tagTeams.findById(id) : null)))
        : [];
      const sides = isTagChallenge
        ? await Promise.all(teams.map(async (team) => {
          const members = await Promise.all((team ? [team.player1Id, team.player2Id] : []).map((id) => players.findById(id)));
          return members.filter((member) => member !== null);
        }))
        : [[responderPlayer], counterTarget ? [counterTarget] : []];
      const titleError = titleAvailabilityError(championship) ?? challengeTitleFitError(championship, {
        challengeMode: challenge.challengeMode,
        matchType: counterMatchType,
        sides,
      });
      if (titleError) return badRequest(titleError);
    }

    const counterChallengeId = uuidv4();

    const counterChallenge: Record<string, unknown> = {
      challengeId: counterChallengeId,
      challengerId: responderPlayer.playerId,
      challengedId: challenge.challengerId,
      matchType: counterMatchType,
      status: 'pending',
      expiresAt: challengeExpiresAt(),
      createdAt: now,
      updatedAt: now,
    };
    if (challenge.challengeMode === 'tag_team') {
      counterChallenge.challengeMode = 'tag_team';
      counterChallenge.challengerTagTeamId = challenge.challengedTagTeamId;
      counterChallenge.challengedTagTeamId = challenge.challengerTagTeamId;
    }
    if (challenge.championshipId) counterChallenge.championshipId = challenge.championshipId;
    if (challenge.promoId) counterChallenge.promoId = challenge.promoId;
    if (counterStipulation) counterChallenge.stipulation = counterStipulation;
    if (counterMessage) counterChallenge.message = counterMessage;

    const { runInTransaction } = getRepositories();

    const counterPatch: Record<string, unknown> = {
      status: 'countered',
      counteredChallengeId: counterChallengeId,
    };
    if (responseMessage) counterPatch.responseMessage = responseMessage;

    await runInTransaction(async (tx) => {
      tx.updateChallenge(challengeId, counterPatch);
      tx.createChallenge(counterChallenge);
    });

    return success({
      original: { ...challenge, status: 'countered', responseMessage, counteredChallengeId: counterChallengeId, updatedAt: now },
      counter: counterChallenge,
    });
  } catch (err) {
    console.error('Error responding to challenge:', err);
    return serverError('Failed to respond to challenge');
  }
};
