import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { v4 as uuidv4 } from 'uuid';
import { createNotification } from '../../lib/notifications';

const VALID_PROMO_TYPES = ['open-mic', 'call-out', 'response', 'pre-match', 'post-match', 'championship', 'return'];

interface CreatePromoBody {
  promoType: string;
  title?: string;
  content: string;
  targetPlayerId?: string;
  targetPromoId?: string;
  matchId?: string;
  championshipId?: string;
  challengeMode?: 'singles' | 'tag_team';
  challengerTagTeamName?: string;
  targetTagTeamName?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can cut promos');
    }

    const { data: body, error: parseError } = parseBody<CreatePromoBody>(event);
    if (parseError) return parseError;
    const { promoType, title, content, targetPlayerId, targetPromoId, matchId, championshipId, challengeMode, challengerTagTeamName, targetTagTeamName } = body;

    if (!promoType || !VALID_PROMO_TYPES.includes(promoType)) {
      return badRequest('Valid promoType is required');
    }
    if (!content || content.length < 50) {
      return badRequest('Content must be at least 50 characters');
    }
    if (content.length > 2000) {
      return badRequest('Content must be at most 2000 characters');
    }

    // Find the player via user sub
    const playerResult = await dynamoDb.query({
      TableName: TableNames.PLAYERS,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': auth.sub },
    });
    const player = playerResult.Items?.[0];
    if (!player) {
      return badRequest('No player profile linked to your account');
    }

    const now = new Date().toISOString();

    const promo: Record<string, unknown> = {
      promoId: uuidv4(),
      playerId: player.playerId as string,
      promoType,
      content,
      reactions: {},
      reactionCounts: { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
      isPinned: false,
      isHidden: false,
      createdAt: now,
      updatedAt: now,
    };

    if (title) promo.title = title;
    if (targetPlayerId) promo.targetPlayerId = targetPlayerId;
    if (targetPromoId) promo.targetPromoId = targetPromoId;
    if (matchId) promo.matchId = matchId;
    if (championshipId) promo.championshipId = championshipId;
    if (challengeMode) promo.challengeMode = challengeMode;
    if (challengerTagTeamName) promo.challengerTagTeamName = challengerTagTeamName;
    if (targetTagTeamName) promo.targetTagTeamName = targetTagTeamName;

    await dynamoDb.put({
      TableName: TableNames.PROMOS,
      Item: promo,
    });

    // Notify the target player if they have a linked user account
    if (targetPlayerId) {
      const targetResult = await dynamoDb.get({
        TableName: TableNames.PLAYERS,
        Key: { playerId: targetPlayerId },
      });
      const targetPlayer = targetResult.Item as Record<string, unknown> | undefined;
      if (targetPlayer?.userId) {
        await createNotification({
          userId: targetPlayer.userId as string,
          type: 'promo_mention',
          message: `${player.name as string} cut a promo calling you out!`,
          sourceId: promo.promoId as string,
          sourceType: 'promo',
        });
      }
    }

    return created(promo);
  } catch (err) {
    console.error('Error creating promo:', err);
    return serverError('Failed to create promo');
  }
};
