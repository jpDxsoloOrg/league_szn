import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import type { Promo } from '../../lib/repositories/types';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const FILTER_MODES = ['all', 'by-faction', 'directed-at-faction', 'featuring-faction'] as const;
type FilterMode = typeof FILTER_MODES[number];

interface PromoRow {
  promoId: string;
  promoType: Promo['promoType'];
  thumbnail: string | null;
  headline: string | null;
  excerpt: string;
  authorPlayerId: string;
  authorPlayerName: string;
  authorWrestlerName: string;
  targetPlayerId: string | null;
  targetPlayerName: string | null;
  targetWrestlerName: string | null;
  date: string;
  viewCount: number | null;
  heatImpact: number | null;
  isReplyable: boolean;
}

interface PromosPage {
  items: PromoRow[];
  nextCursor?: string;
}

const encodeOffset = (offset: number): string =>
  Buffer.from(String(offset), 'utf-8').toString('base64');

const decodeOffset = (cursor: string | undefined): number => {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, 'base64').toString('utf-8'));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('Invalid pagination cursor');
  }
  return n;
};

/**
 * GET /stables/{stableId}/promos?filter=&limit=&cursor=
 *
 * Public read. Returns promos authored by or directed at any current member
 * of the faction, sorted newest-first. Cursor-based pagination.
 *
 * Filter modes (load-bearing on FAC-14 — do not rename):
 *  - "all"                  : author ∈ memberIds OR target ∈ memberIds   (default)
 *  - "by-faction"           : author ∈ memberIds
 *  - "directed-at-faction"  : target ∈ memberIds AND author ∉ memberIds
 *  - "featuring-faction"    : author ∈ memberIds AND target ∈ memberIds
 *
 * The "by-faction" mode uses the PlayerIndex GSI (one Query per member).
 * The other modes need to filter on targetPlayerId, which has no GSI today —
 * those paths fall back to a full table scan. If promo traffic grows, add a
 * TargetPlayerIndex GSI and route those modes through it.
 *
 * Heat impact and view count are returned as `null` placeholders — heat is
 * owned by FAC-11, and view counts aren't tracked yet. Frontends should
 * treat the contract as stable and render `—` when null.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const factionId = event.pathParameters?.stableId;
    if (!factionId) {
      return badRequest('stableId is required');
    }

    const qs = event.queryStringParameters || {};
    const filterRaw = (qs.filter || 'all').trim();
    if (!FILTER_MODES.includes(filterRaw as FilterMode)) {
      return badRequest(`filter must be one of ${FILTER_MODES.join(', ')}`);
    }
    const filter = filterRaw as FilterMode;

    let limit = DEFAULT_LIMIT;
    if (qs.limit) {
      const parsed = Number(qs.limit);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return badRequest('limit must be a positive number');
      }
      limit = Math.min(Math.floor(parsed), MAX_LIMIT);
    }

    let offset: number;
    try {
      offset = decodeOffset(qs.cursor);
    } catch {
      return badRequest('Invalid pagination cursor');
    }

    const {
      roster: { stables: stablesRepo, players: playersRepo },
      content: { promos: promosRepo },
    } = getRepositories();

    const faction = await stablesRepo.findById(factionId);
    if (!faction) {
      return notFound('Faction not found');
    }

    const memberIds = new Set(faction.memberIds ?? []);

    let candidates: Promo[];
    if (filter === 'by-faction') {
      // Cheap path: one GSI Query per member, then merge + dedupe by promoId.
      const perMember = await Promise.all(
        Array.from(memberIds).map((id) => promosRepo.listByPlayer(id)),
      );
      const seen = new Set<string>();
      candidates = [];
      for (const list of perMember) {
        for (const p of list) {
          if (!seen.has(p.promoId)) {
            seen.add(p.promoId);
            candidates.push(p);
          }
        }
      }
    } else {
      // Modes that pivot on targetPlayerId need a scan today.
      candidates = await promosRepo.list();
    }

    const matching = candidates.filter((p) => {
      const authorInFaction = memberIds.has(p.playerId);
      const targetInFaction = p.targetPlayerId ? memberIds.has(p.targetPlayerId) : false;
      switch (filter) {
        case 'by-faction':
          return authorInFaction;
        case 'directed-at-faction':
          return targetInFaction && !authorInFaction;
        case 'featuring-faction':
          return authorInFaction && targetInFaction;
        case 'all':
        default:
          return authorInFaction || targetInFaction;
      }
    });

    // Drop hidden promos so the public feed can't be poisoned by moderated content.
    const visible = matching.filter((p) => !p.isHidden);

    visible.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const pageItems = visible.slice(offset, offset + limit);

    // Hydrate author + target names (one findById per unique player).
    const lookupIds = new Set<string>();
    for (const p of pageItems) {
      lookupIds.add(p.playerId);
      if (p.targetPlayerId) lookupIds.add(p.targetPlayerId);
    }
    const playerEntries = await Promise.all(
      Array.from(lookupIds).map(async (pid) => [pid, await playersRepo.findById(pid)] as const),
    );
    const playerById = new Map(playerEntries);

    const items: PromoRow[] = pageItems.map((p) => {
      const author = playerById.get(p.playerId);
      const target = p.targetPlayerId ? playerById.get(p.targetPlayerId) ?? null : null;
      const excerpt = (p.content || '').slice(0, 200);
      return {
        promoId: p.promoId,
        promoType: p.promoType,
        thumbnail: p.imageUrl ?? null,
        headline: p.title ?? null,
        excerpt,
        authorPlayerId: p.playerId,
        authorPlayerName: author?.name ?? 'Unknown',
        authorWrestlerName: author?.currentWrestler ?? 'Unknown',
        targetPlayerId: p.targetPlayerId ?? null,
        targetPlayerName: target?.name ?? null,
        targetWrestlerName: target?.currentWrestler ?? null,
        date: p.createdAt,
        viewCount: null,
        heatImpact: null,
        isReplyable: p.promoType !== 'response',
      };
    });

    const nextOffset = offset + pageItems.length;
    const response: PromosPage = {
      items,
      ...(nextOffset < visible.length ? { nextCursor: encodeOffset(nextOffset) } : {}),
    };

    return success(response);
  } catch (err) {
    console.error('Error computing faction promos:', err);
    return serverError('Failed to compute faction promos');
  }
};
