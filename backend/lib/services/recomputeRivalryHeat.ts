import type { UnitOfWork } from '../repositories/unitOfWork';
import { getRepositories } from '../repositories';
import { computeRivalryHeat, type HeatTier } from '../policies/rivalryHeat';

export interface RecomputeRivalryHeatResult {
  heatScore: number;
  heat: HeatTier;
  ratedMatchCount: number;
}

/**
 * Recompute a rivalry's heat from the values currently persisted on its
 * matches' rating aggregates. RIV-26.
 *
 * Use this from:
 *   - The backfill script (`scripts/backfill-rivalry-heat.ts`)
 *   - The admin recompute endpoint
 *     (`POST /rivalry-requests/{rivalryId}/recompute-heat`)
 *   - Any future post-commit healing flow (e.g. a sweep after a manual
 *     match edit)
 *
 * **NOT** used by `submitRating` — that handler must project the
 * *in-flight* rating values for the match being rated (because the
 * rating hasn't been committed yet at projection time). Mixing the two
 * use cases would either re-read stale aggregates or require a more
 * complex override-shape API; the duplication is intentional and tiny.
 *
 * When `tx` is provided, the rivalry write is staged on the supplied
 * UnitOfWork so the caller can combine the recompute with other writes
 * in a single transaction. When `tx` is omitted, the helper opens its
 * own `runInTransaction` and flushes immediately.
 *
 * Either way, the freshly-computed heat values are returned so the
 * caller can log / surface them without an extra read.
 */
export async function recomputeRivalryHeat(
  rivalryId: string,
  tx?: UnitOfWork,
): Promise<RecomputeRivalryHeatResult> {
  const repos = getRepositories();
  const matches = await repos.competition.matches.findByRivalryId(rivalryId);
  const ratedInputs = matches.map((m) => ({
    ratingAverage: m.ratingAverage ?? 0,
    ratingsCount: m.ratingsCount ?? 0,
  }));
  const result = computeRivalryHeat({ matches: ratedInputs });
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
  };
}
