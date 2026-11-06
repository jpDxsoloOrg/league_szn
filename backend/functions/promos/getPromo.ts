import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, notFound, badRequest, serverError } from '../../lib/response';
import type { Promo } from '../../lib/repositories/types';
import { getVerifiedCaller, isStaff } from '../../lib/optionalCaller';
import { FORMER_MEMBER, findHiddenPlayerIds, isPlayerVisible, resolveBilledName } from '../../lib/needsWrestler';
import { loadChampionshipNames, withoutReactions } from '../../lib/publicPromo';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const promoId = event.pathParameters?.promoId;
    if (!promoId) {
      return badRequest('promoId is required');
    }

    const { content: { promos }, roster: { players }, competition: { championships } } = getRepositories();

    const promo = await promos.findById(promoId);
    if (!promo) {
      return notFound('Promo not found');
    }

    // A moderated promo, or one by a hidden player, stays readable by staff
    // and by its author only.
    const caller = await getVerifiedCaller(event);
    const staff = isStaff(caller);
    const callerPlayer = !staff && caller?.sub ? await players.findByUserId(caller.sub) : null;
    const isOwnOrStaff = (p: Promo): boolean => staff || p.playerId === callerPlayer?.playerId;

    const rootAuthor = await players.findById(promo.playerId);
    if ((promo.isHidden || (rootAuthor && !isPlayerVisible(rootAuthor))) && !isOwnOrStaff(promo)) {
      return notFound('Promo not found');
    }

    // Get responses to this promo
    const visibleResponses = (await promos.listResponsesTo(promoId))
      .filter((p) => !p.isHidden);
    const hiddenAuthorIds = await findHiddenPlayerIds(
      visibleResponses.map((p) => p.playerId),
      (playerId) => players.findById(playerId),
    );
    const responses = visibleResponses.filter((p) => !hiddenAuthorIds.has(p.playerId) || isOwnOrStaff(p));

    // Collect player IDs
    const uniquePlayerIds = new Set<string>();
    uniquePlayerIds.add(promo.playerId);
    if (promo.targetPlayerId) uniquePlayerIds.add(promo.targetPlayerId);
    for (const r of responses) {
      uniquePlayerIds.add(r.playerId);
      if (r.targetPlayerId) uniquePlayerIds.add(r.targetPlayerId);
    }
    const playerIds = [...uniquePlayerIds];
    const fetchedPlayers = await Promise.all(playerIds.map((pid) => players.findByIdWithDeleted(pid)));

    const playerMap: Record<string, { name: string; wrestlerName: string; imageUrl?: string }> = {};
    playerIds.forEach((pid, index) => {
      const player = fetchedPlayers[index];
      if (player) {
        playerMap[pid] = {
          name: player.name,
          wrestlerName: resolveBilledName(undefined, player, FORMER_MEMBER),
          imageUrl: player.imageUrl,
        };
      }
    });

    const author = playerMap[promo.playerId];
    const target = promo.targetPlayerId ? playerMap[promo.targetPlayerId] : undefined;

    // Find target promo if response
    let targetPromo: Record<string, unknown> | undefined;
    if (promo.targetPromoId) {
      const tp = await promos.findById(promo.targetPromoId);
      const targetAuthor = tp ? await players.findById(tp.playerId) : null;
      const targetHidden = tp?.isHidden || (targetAuthor && !isPlayerVisible(targetAuthor));
      if (tp && (!targetHidden || isOwnOrStaff(tp))) {
        targetPromo = {
          promoId: tp.promoId,
          playerId: tp.playerId,
          promoType: tp.promoType,
          title: tp.title,
          content: '',
          reactions: {},
          reactionCounts: tp.reactionCounts || { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
          isPinned: tp.isPinned,
          isHidden: tp.isHidden,
          createdAt: tp.createdAt,
          updatedAt: tp.updatedAt,
        };
      }
    }

    const championshipNames = await loadChampionshipNames([promo, ...responses], (id) => championships.findById(id));
    const championshipNameOf = (p: Promo) => (p.championshipId ? championshipNames.get(p.championshipId) : undefined);

    const enrichedResponses = responses
      .map((r) => {
        const rAuthor = playerMap[r.playerId];
        const rTarget = r.targetPlayerId ? playerMap[r.targetPlayerId] : undefined;
        return {
          ...withoutReactions(r),
          playerName: rAuthor?.name || FORMER_MEMBER,
          wrestlerName: rAuthor?.wrestlerName || FORMER_MEMBER,
          playerImageUrl: rAuthor?.imageUrl,
          targetPlayerName: rTarget?.name,
          targetWrestlerName: rTarget?.wrestlerName,
          championshipName: championshipNameOf(r),
          responseCount: 0,
        };
      })
      .sort((a, b) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());

    return success({
      promo: {
        ...withoutReactions(promo),
        playerName: author?.name || FORMER_MEMBER,
        wrestlerName: author?.wrestlerName || FORMER_MEMBER,
        playerImageUrl: author?.imageUrl,
        targetPlayerName: target?.name,
        targetWrestlerName: target?.wrestlerName,
        championshipName: championshipNameOf(promo),
        targetPromo,
        responseCount: responses.length,
      },
      responses: enrichedResponses,
    });
  } catch (err) {
    console.error('Error fetching promo:', err);
    return serverError('Failed to fetch promo');
  }
};
