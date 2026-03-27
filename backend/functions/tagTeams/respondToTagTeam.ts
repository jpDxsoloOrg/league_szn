import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames, getOrNotFound } from '../../lib/dynamodb';
import { success, badRequest, serverError, forbidden } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface RespondToTagTeamBody {
  action: 'accept' | 'decline';
}

interface TagTeamRecord {
  [key: string]: unknown;
  tagTeamId: string;
  player1Id: string;
  player2Id: string;
  status: string;
}

interface PlayerRecord {
  playerId: string;
  userId?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can respond to tag team invitations');
    }

    const tagTeamId = event.pathParameters?.tagTeamId;
    if (!tagTeamId) {
      return badRequest('tagTeamId is required');
    }

    const { data: body, error: parseError } = parseBody<RespondToTagTeamBody>(event);
    if (parseError) return parseError;
    const { action } = body;

    if (!action || (action !== 'accept' && action !== 'decline')) {
      return badRequest('action must be "accept" or "decline"');
    }

    // Get tag team
    const result = await getOrNotFound<TagTeamRecord>(
      TableNames.TAG_TEAMS,
      { tagTeamId },
      'Tag team not found'
    );

    if ('notFoundResponse' in result) {
      return result.notFoundResponse;
    }

    const tagTeam = result.item;

    if (tagTeam.status !== 'pending_partner') {
      return badRequest('This tag team is not awaiting partner response');
    }

    // Verify caller is player2 (the invited partner)
    const callerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });

    const callerPlayer = callerResult.Items?.[0] as PlayerRecord | undefined;
    if (!callerPlayer) {
      return badRequest('No player profile linked to your account');
    }

    if (callerPlayer.playerId !== tagTeam.player2Id) {
      return forbidden('Only the invited partner can respond to this invitation');
    }

    const now = new Date().toISOString();
    const newStatus = action === 'accept' ? 'pending_admin' : 'dissolved';

    const updateFields: Record<string, string> = {
      status: newStatus,
      updatedAt: now,
    };

    if (action === 'decline') {
      updateFields.dissolvedAt = now;
    }

    await dynamoDb.update({
      TableName: TableNames.TAG_TEAMS,
      Key: { tagTeamId },
      UpdateExpression: action === 'decline'
        ? 'SET #status = :status, #updatedAt = :updatedAt, #dissolvedAt = :dissolvedAt'
        : 'SET #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: action === 'decline'
        ? { '#status': 'status', '#updatedAt': 'updatedAt', '#dissolvedAt': 'dissolvedAt' }
        : { '#status': 'status', '#updatedAt': 'updatedAt' },
      ExpressionAttributeValues: action === 'decline'
        ? { ':status': newStatus, ':updatedAt': now, ':dissolvedAt': now }
        : { ':status': newStatus, ':updatedAt': now },
    });

    return success({
      tagTeamId,
      status: newStatus,
      message: action === 'accept'
        ? 'Invitation accepted, awaiting admin approval'
        : 'Invitation declined',
    });
  } catch (err) {
    console.error('Error responding to tag team:', err);
    return serverError('Failed to respond to tag team invitation');
  }
};
