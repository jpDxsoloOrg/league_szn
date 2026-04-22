import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { parseBody } from '../../lib/parseBody';
import {
  WRESTLER_PROMOTIONS,
  OVERALL_CAP_MIN,
  OVERALL_CAP_MAX,
  type WrestlerCreateInput,
  type WrestlerImportResult,
  type WrestlerPromotion,
} from '../../lib/repositories/types';
import { badRequest, serverError, success } from '../../lib/response';

function isWrestlerPromotion(value: unknown): value is WrestlerPromotion {
  return (
    typeof value === 'string' &&
    (WRESTLER_PROMOTIONS as readonly string[]).includes(value)
  );
}

interface RawRow {
  promotion?: unknown;
  name?: unknown;
  overallCap?: unknown;
}

interface ValidatedRow {
  row: number;
  input: WrestlerCreateInput;
}

interface RowError {
  row: number;
  reason: string;
}

function validateRow(raw: RawRow, rowIndex: number): ValidatedRow | RowError {
  if (!isWrestlerPromotion(raw.promotion)) {
    return {
      row: rowIndex,
      reason: `promotion must be one of: ${WRESTLER_PROMOTIONS.join(', ')}`,
    };
  }
  const name = raw.name;
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 128) {
    return {
      row: rowIndex,
      reason: 'name must be a non-empty string up to 128 chars',
    };
  }
  const cap = raw.overallCap;
  if (
    typeof cap !== 'number' ||
    !Number.isInteger(cap) ||
    cap < OVERALL_CAP_MIN ||
    cap > OVERALL_CAP_MAX
  ) {
    return {
      row: rowIndex,
      reason: `overallCap must be an integer between ${OVERALL_CAP_MIN} and ${OVERALL_CAP_MAX}`,
    };
  }
  return {
    row: rowIndex,
    input: { promotion: raw.promotion, name, overallCap: cap },
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const raw = body as Record<string, unknown>;
    const wrestlersRaw = raw.wrestlers;
    if (!Array.isArray(wrestlersRaw)) {
      return badRequest('wrestlers must be an array');
    }

    const payloadErrors: RowError[] = [];
    const validated: ValidatedRow[] = [];

    wrestlersRaw.forEach((entry, idx) => {
      if (entry === null || typeof entry !== 'object') {
        payloadErrors.push({ row: idx, reason: 'row must be an object' });
        return;
      }
      const result = validateRow(entry as RawRow, idx);
      if ('input' in result) {
        validated.push(result);
      } else {
        payloadErrors.push(result);
      }
    });

    // Dedupe within the payload by (promotion, name.toLowerCase()), keeping first.
    const seen = new Map<string, number>();
    const deduped: WrestlerCreateInput[] = [];
    let internalSkipped = 0;
    for (const v of validated) {
      const key = `${v.input.promotion}::${v.input.name.toLowerCase()}`;
      if (seen.has(key)) {
        internalSkipped++;
        continue;
      }
      seen.set(key, v.row);
      deduped.push(v.input);
    }

    const repo = getRepositories().roster.wrestlers;
    const repoResult = await repo.bulkCreate(deduped);

    const merged: WrestlerImportResult = {
      created: repoResult.created,
      skipped: repoResult.skipped + internalSkipped,
      errors: [...payloadErrors, ...repoResult.errors],
    };

    return success(merged);
  } catch (err) {
    console.error('Error importing wrestlers:', err);
    return serverError('Failed to import wrestlers');
  }
};
