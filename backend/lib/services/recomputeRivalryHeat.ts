import type { UnitOfWork } from '../repositories/unitOfWork';
import { getRepositories } from '../repositories';
import {
  computeRivalryHeat,
  type HeatTier,
  type HeatResult,
  type RatedMatchInput,
  type PromoHeatInput,
  type HeatTunables,
} from '../policies/rivalryHeat';
import type { Promo } from '../repositories/types';

export interface RecomputeRivalryHeatResult {
  heatScore: number;
  heat: HeatTier;
  ratedMatchCount: number;
  promoCount: number;
}

/**
 * Map a `Promo` to the policy's reaction-only input shape. Only
 * 'call-out' and 'rivalry' promo types contribute to heat — other
 * types may carry a `rivalryId` for context, but they don't change
 * the score. Promos without a `rivalryId` never reach this function.
 */
const PROMO_TYPES_CONTRIBUTING_TO_HEAT: ReadonlyArray<Promo['promoType']> = [
  'call-out',
  'rivalry',
];

function promoToHeatInput(promo: Promo): PromoHeatInput | null {
  if (!PROMO_TYPES_CONTRIBUTING_TO_HEAT.includes(promo.promoType)) return null;
  if (promo.isHidden) return null;
  return {
    fireCount: promo.reactionCounts?.fire ?? 0,
    trashCount: promo.reactionCounts?.trash ?? 0,
  };
}

/**
 * Compute a rivalry's heat from a caller-supplied `matches` projection
 * plus the rivalry's persisted promos + the live admin tunables.
 *
 * `matches` is provided by the caller because the inline submit-rating
 * flow needs to project an in-flight rating that isn't committed yet.
 * The recompute path (below) builds it from persisted aggregates.
 *
 * Pure-ish: only reads (promos + tunables); no writes.
 */
export async function computeHeatForRivalry(
  rivalryId: string,
  matches: RatedMatchInput[],
): Promise<HeatResult> {
  const repos = getRepositories();
  const [promos, tunables] = await Promise.all([
    repos.content.promos.listByRivalry(rivalryId),
    repos.user.siteConfig.getHeatTunables(),
  ]);
  const promoInputs = promos
    .map(promoToHeatInput)
    .filter((p): p is PromoHeatInput => p !== null);
  const tunablesOverride: HeatTunables = { ...tunables };
  return computeRivalryHeat({ matches, promos: promoInputs }, tunablesOverride);
}

/**
 * Recompute a rivalry's heat from the values currently persisted on its
 * matches' rating aggregates plus its promos. RIV-26 + promo-heat extension.
 *
 * Use this from:
 *   - The backfill script (`scripts/backfill-rivalry-heat.ts`)
 *   - The admin recompute endpoint
 *     (`POST /rivalry-requests/{rivalryId}/recompute-heat`)
 *   - `createPromo` / `reactToPromo` (promo-driven heat changes)
 *   - Any future post-commit healing flow
 *
 * The submit-rating handler still projects in-flight match aggregates
 * inline via `computeHeatForRivalry` because the new rating isn't
 * committed at projection time.
 *
 * When `tx` is provided, the rivalry write is staged on the supplied
 * UnitOfWork so the caller can combine the recompute with other writes
 * in a single transaction. When `tx` is omitted, the helper opens its
 * own `runInTransaction` and flushes immediately.
 */
export async function recomputeRivalryHeat(
  rivalryId: string,
  tx?: UnitOfWork,
): Promise<RecomputeRivalryHeatResult> {
  const repos = getRepositories();
  const matches = await repos.competition.matches.findByRivalryId(rivalryId);
  const ratedInputs: RatedMatchInput[] = matches.map((m) => ({
    ratingAverage: m.ratingAverage ?? 0,
    ratingsCount: m.ratingsCount ?? 0,
    matchOfTheNight: m.matchOfTheNight === true,
  }));

  const result = await computeHeatForRivalry(rivalryId, ratedInputs);
  const patch = { heatScore: result.heatScore, heat: result.tier };

  if (tx) {
    tx.updateRivalry(rivalryId, patch);
  } else {
    await repos.runInTransaction(async (innerTx) => {
      innerTx.updateRivalry(rivalryId, patch);
    });
  }

  return {
    heatScore: result.heatScore,
    heat: result.tier,
    ratedMatchCount: result.ratedMatchCount,
    promoCount: result.promoCount,
  };
}
