import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import type { Promo, PromoType } from '../../lib/repositories/types';
import { FORMER_MEMBER, isHiddenLivePlayer, resolveBilledName } from '../../lib/needsWrestler';
import { getVerifiedCaller, isStaff } from '../../lib/optionalCaller';
import { isPromoArchived } from '../../lib/promoArchive';
import { withoutReactions } from '../../lib/publicPromo';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { playerId, promoType, includeHidden, includeArchived, excludeResponses } = event.queryStringParameters || {};

    // Both flags are staff-only and are ignored for anyone else. includeHidden
    // covers moderated promos and promos by players hidden from the roster.
    const caller = await getVerifiedCaller(event);
    const staff = isStaff(caller);
    const showHidden = staff && includeHidden === 'true';
    const showArchived = staff && includeArchived === 'true';

    const { content: { promos }, roster: { players } } = getRepositories();

    let promoList: Promo[];

    if (playerId) {
      promoList = await promos.listByPlayer(playerId);
    } else if (promoType) {
      promoList = await promos.listByType(promoType as PromoType);
    } else {
      promoList = await promos.list();
    }

    // Collect unique player IDs for enrichment
    const uniquePlayerIds = new Set<string>();
    for (const p of promoList) {
      uniquePlayerIds.add(p.playerId);
      if (p.targetPlayerId) uniquePlayerIds.add(p.targetPlayerId);
    }
    const playerIds = [...uniquePlayerIds];
    const fetchedPlayers = await Promise.all(playerIds.map((pid) => players.findByIdWithDeleted(pid)));

    const playerMap: Record<string, { name: string; currentWrestler: string; imageUrl?: string }> = {};
    const hiddenPlayerIds = new Set<string>();
    playerIds.forEach((pid, index) => {
      const player = fetchedPlayers[index];
      if (player) {
        if (isHiddenLivePlayer(player)) hiddenPlayerIds.add(pid);
        playerMap[pid] = {
          name: player.name,
          currentWrestler: resolveBilledName(undefined, player, FORMER_MEMBER),
          imageUrl: player.imageUrl,
        };
      }
    });

    // A player hidden from the roster still sees their own promos. A failed
    // lookup falls back to the public view rather than failing the feed.
    if (hiddenPlayerIds.size > 0 && caller?.sub) {
      const callerPlayer = await players.findByUserId(caller.sub).catch(() => null);
      if (callerPlayer) hiddenPlayerIds.delete(callerPlayer.playerId);
    }

    const isListed = (p: Promo): boolean =>
      showHidden || (!p.isHidden && !hiddenPlayerIds.has(p.playerId));

    // Count responses for each promo
    const promoIds = new Set(promoList.map((p) => p.promoId));
    const responseCounts: Record<string, number> = {};
    for (const p of promoList) {
      if (p.targetPromoId && promoIds.has(p.targetPromoId) && isListed(p)) {
        responseCounts[p.targetPromoId] = (responseCounts[p.targetPromoId] || 0) + 1;
      }
    }

    // Enrich with player context
    const now = Date.now();
    const enriched = promoList
      .filter(isListed)
      .filter((p) => showArchived || !isPromoArchived(p, now))
      .filter((p) => !(excludeResponses === 'true' && (p.targetPromoId || p.promoType === 'response')))
      .map((p) => {
        const author = playerMap[p.playerId];
        const target = p.targetPlayerId ? playerMap[p.targetPlayerId] : undefined;

        // Find target promo if it's a response
        let targetPromo: Record<string, unknown> | undefined;
        if (p.targetPromoId) {
          const tp = promoList.find((pp) => pp.promoId === p.targetPromoId);
          if (tp && isListed(tp)) {
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

        return {
          ...withoutReactions(p),
          playerName: author?.name || FORMER_MEMBER,
          wrestlerName: author?.currentWrestler || FORMER_MEMBER,
          playerImageUrl: author?.imageUrl,
          targetPlayerName: target?.name,
          targetWrestlerName: target?.currentWrestler,
          targetPromo,
          responseCount: responseCounts[p.promoId] || 0,
          ...(staff ? { isArchived: isPromoArchived(p, now) } : {}),
        };
      });

    // Sort by createdAt descending
    enriched.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());

    return success(enriched);
  } catch (err) {
    console.error('Error fetching promos:', err);
    return serverError('Failed to fetch promos');
  }
};
