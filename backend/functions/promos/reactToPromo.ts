import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext, requireRole } from '../../lib/auth';

const VALID_REACTIONS = ['fire', 'mic', 'trash', 'mind-blown', 'clap'];

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const denied = requireRole(event, 'Wrestler');
    if (denied) return denied;

    const auth = getAuthContext(event);
    const promoId = event.pathParameters?.promoId;
    if (!promoId) {
      return badRequest('promoId is required');
    }

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;
    const { reaction } = body;

    if (!reaction || !VALID_REACTIONS.includes(reaction)) {
      return badRequest('Valid reaction is required (fire, mic, trash, mind-blown, clap)');
    }

    // Get the promo
    const result = await dynamoDb.get({
      TableName: TableNames.PROMOS,
      Key: { promoId },
    });
    const promo = result.Item;
    if (!promo) {
      return notFound('Promo not found');
    }

    const userId = auth.sub;
    const reactions = (promo.reactions as Record<string, string>) || {};
    const reactionCounts = (promo.reactionCounts as Record<string, number>) || {
      fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0,
    };

    const existingReaction = reactions[userId];

    if (existingReaction === reaction) {
      // Toggle off
      delete reactions[userId];
      reactionCounts[reaction] = Math.max(0, (reactionCounts[reaction] || 0) - 1);
    } else {
      // Remove previous reaction if exists
      if (existingReaction) {
        reactionCounts[existingReaction] = Math.max(0, (reactionCounts[existingReaction] || 0) - 1);
      }
      // Add new reaction
      reactions[userId] = reaction;
      reactionCounts[reaction] = (reactionCounts[reaction] || 0) + 1;
    }

    const now = new Date().toISOString();

    await dynamoDb.update({
      TableName: TableNames.PROMOS,
      Key: { promoId },
      UpdateExpression: 'SET reactions = :r, reactionCounts = :rc, updatedAt = :now',
      ExpressionAttributeValues: {
        ':r': reactions,
        ':rc': reactionCounts,
        ':now': now,
      },
    });

    return success({ reactions, reactionCounts });
  } catch (err) {
    console.error('Error reacting to promo:', err);
    return serverError('Failed to react to promo');
  }
};
