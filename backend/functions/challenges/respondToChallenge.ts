import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError, forbidden } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { v4 as uuidv4 } from 'uuid';

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

    if (!event.body) {
      return badRequest('Request body is required');
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return badRequest('Invalid JSON in request body');
    }

    const { action, responseMessage, counterMatchType, counterStipulation, counterMessage } = body as {
      action: ChallengeAction;
      responseMessage?: string;
      counterMatchType?: string;
      counterStipulation?: string;
      counterMessage?: string;
    };

    if (!action || !['accept', 'decline', 'counter'].includes(action)) {
      return badRequest('action must be accept, decline, or counter');
    }

    const { user: { challenges }, roster: { players, tagTeams } } = getRepositories();

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

    const counterChallengeId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const counterChallenge: Record<string, unknown> = {
      challengeId: counterChallengeId,
      challengerId: responderPlayer.playerId,
      challengedId: challenge.challengerId,
      matchType: counterMatchType,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      createdAt: now,
      updatedAt: now,
    };
    if (challenge.challengeMode === 'tag_team') {
      counterChallenge.challengeMode = 'tag_team';
      counterChallenge.challengerTagTeamId = challenge.challengedTagTeamId;
      counterChallenge.challengedTagTeamId = challenge.challengerTagTeamId;
    }
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
