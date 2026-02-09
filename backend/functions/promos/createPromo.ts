import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { created, badRequest, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { v4 as uuidv4 } from 'uuid';

const VALID_PROMO_TYPES = ['open-mic', 'call-out', 'response', 'pre-match', 'post-match', 'championship', 'return'];

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Only wrestlers can cut promos');
    }

    const body = JSON.parse(event.body || '{}');
    const { promoType, title, content, targetPlayerId, targetPromoId, matchId, championshipId } = body;

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

    await dynamoDb.put({
      TableName: TableNames.PROMOS,
      Item: promo,
    });

    return created(promo);
  } catch (err) {
    console.error('Error creating promo:', err);
    return serverError('Failed to create promo');
  }
};
