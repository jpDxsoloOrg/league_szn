import type { APIGatewayProxyResult } from 'aws-lambda';
import { badRequest } from './response';
import { getRepositories } from './repositories';
import { NotFoundError } from './repositories/errors';
import type { DivisionCreateInput, DivisionPatch } from './repositories/LeagueOpsRepository';
import type { Division } from './repositories/types';

/**
 * Name the signup lookup used before divisions carried an explicit flag.
 * Only consulted as a fallback when no division is flagged as the default.
 */
export const LEGACY_DEFAULT_DIVISION_NAME = 'young boys';

export type DefaultDivisionSource = 'flag' | 'name-fallback' | 'none';

export interface DefaultDivisionLookup {
  division: Division | undefined;
  source: DefaultDivisionSource;
}

type WarnFn = (message: string) => void;

const byCreatedAt = (a: Division, b: Division): number =>
  (a.createdAt ?? '').localeCompare(b.createdAt ?? '');

/**
 * Pick the division new wrestlers land in.
 *
 * 1. The division flagged `isDefaultForNewWrestlers`. Should there ever be
 *    more than one (a race between two admins), the oldest wins and a
 *    warning is logged.
 * 2. Otherwise the legacy case-insensitive "Young Boys" name match, with a
 *    warning so the missing flag gets noticed.
 * 3. Otherwise no division.
 */
export function findDefaultDivisionForNewWrestlers(
  divisions: Division[],
  warn: WarnFn = console.warn,
): DefaultDivisionLookup {
  const flagged = divisions.filter((d) => d.isDefaultForNewWrestlers === true).sort(byCreatedAt);
  if (flagged.length > 0) {
    if (flagged.length > 1) {
      warn(
        `Multiple divisions are flagged isDefaultForNewWrestlers (${flagged
          .map((d) => d.divisionId)
          .join(', ')}); using ${flagged[0].divisionId}`,
      );
    }
    return { division: flagged[0], source: 'flag' };
  }

  const byName = divisions.find(
    (d) => (d.name ?? '').trim().toLowerCase() === LEGACY_DEFAULT_DIVISION_NAME,
  );
  if (byName) {
    warn(
      `No division is flagged isDefaultForNewWrestlers; falling back to name match ` +
        `"${byName.name}" (${byName.divisionId}). Flag it in Manage Divisions.`,
    );
    return { division: byName, source: 'name-fallback' };
  }

  return { division: undefined, source: 'none' };
}

/** Every division flagged `isDevelopmental`, oldest first. */
export function findDevelopmentalDivisions(divisions: Division[]): Division[] {
  return divisions.filter((d) => d.isDevelopmental === true).sort(byCreatedAt);
}

/** Reject non-boolean flag values before they reach the table. */
export function validateDivisionFlags(body: Record<string, unknown>): APIGatewayProxyResult | null {
  for (const field of ['isDevelopmental', 'isDefaultForNewWrestlers'] as const) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') {
      return badRequest(`${field} must be a boolean`);
    }
  }
  return null;
}

/**
 * Update a division. Setting `isDefaultForNewWrestlers: true` clears the
 * flag on the previous default in the same transaction. Each cleared row is
 * guarded on still being the default, so a concurrent change fails the
 * whole write with `ConcurrencyError` instead of leaving two defaults.
 */
export async function updateDivision(divisionId: string, patch: DivisionPatch): Promise<Division> {
  const { leagueOps, runInTransaction } = getRepositories();
  const { divisions } = leagueOps;

  if (patch.isDefaultForNewWrestlers !== true) {
    return divisions.update(divisionId, patch);
  }

  const all = await divisions.list();
  if (!all.some((d) => d.divisionId === divisionId)) {
    throw new NotFoundError('Division', divisionId);
  }
  const previousDefaults = all.filter(
    (d) => d.isDefaultForNewWrestlers === true && d.divisionId !== divisionId,
  );

  await runInTransaction(async (tx) => {
    for (const previous of previousDefaults) {
      tx.updateDivision(
        previous.divisionId,
        { isDefaultForNewWrestlers: false },
        { isDefaultForNewWrestlers: true },
      );
    }
    tx.updateDivision(divisionId, patch);
  });

  const updated = await divisions.findById(divisionId);
  if (!updated) throw new NotFoundError('Division', divisionId);
  return updated;
}

/**
 * Create a division. A new default is created unflagged and then promoted
 * through `updateDivision`, so the previous default is cleared atomically.
 */
export async function createDivision(input: DivisionCreateInput): Promise<Division> {
  const { divisions } = getRepositories().leagueOps;
  const { isDefaultForNewWrestlers, ...rest } = input;
  const created = await divisions.create(rest);
  if (isDefaultForNewWrestlers !== true) return created;
  return updateDivision(created.divisionId, { isDefaultForNewWrestlers: true });
}
