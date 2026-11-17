import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  DEFAULT_FEATURES,
  DEFAULT_TICKER_SETTINGS,
  TICKER_SCROLL_SPEEDS,
  getRepositories,
  type TickerSettings,
} from '../../lib/repositories';
import { TICKER_SEGMENT_KEYS, type TickerSegmentKey } from '../../lib/ticker/segments';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

const VALID_FEATURES = Object.keys(DEFAULT_FEATURES);
const VALID_TICKER_KEYS = Object.keys(DEFAULT_TICKER_SETTINGS);

interface UpdateSiteConfigBody {
  features?: unknown;
  ticker?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSegmentKey(value: unknown): value is TickerSegmentKey {
  return TICKER_SEGMENT_KEYS.some((key) => key === value);
}

/** A validated ticker settings patch, or an error message. */
export function parseTickerPatch(ticker: Record<string, unknown>): { patch: Partial<TickerSettings> } | { error: string } {
  for (const key of Object.keys(ticker)) {
    if (!VALID_TICKER_KEYS.includes(key)) {
      return { error: `Invalid ticker setting: ${key}. Valid keys: ${VALID_TICKER_KEYS.join(', ')}` };
    }
  }

  const patch: Partial<TickerSettings> = {};
  if ('enabledSegments' in ticker) {
    const segments = ticker.enabledSegments;
    if (!Array.isArray(segments) || !segments.every(isSegmentKey)) {
      return { error: `enabledSegments must be an array of: ${TICKER_SEGMENT_KEYS.join(', ')}` };
    }
    patch.enabledSegments = [...new Set(segments)];
  }
  if ('scrollSpeed' in ticker) {
    const speed = TICKER_SCROLL_SPEEDS.find((candidate) => candidate === ticker.scrollSpeed);
    if (!speed) return { error: `scrollSpeed must be one of: ${TICKER_SCROLL_SPEEDS.join(', ')}` };
    patch.scrollSpeed = speed;
  }
  if ('publicRelegationWatch' in ticker) {
    if (typeof ticker.publicRelegationWatch !== 'boolean') return { error: 'publicRelegationWatch must be a boolean' };
    patch.publicRelegationWatch = ticker.publicRelegationWatch;
  }
  return { patch };
}

/**
 * PUT /admin/site-config
 *
 * Body: `{ features?, ticker? }`, at least one. `features` is a partial map of
 * feature flags; `ticker` is a partial `TickerSettings`.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<UpdateSiteConfigBody>(event);
    if (parseError) return parseError;
    const { features, ticker } = body;

    if (features === undefined && ticker === undefined) {
      return badRequest('features object is required');
    }
    if (features !== undefined && !isPlainObject(features)) {
      return badRequest('features object is required');
    }
    if (ticker !== undefined && !isPlainObject(ticker)) {
      return badRequest('ticker must be an object');
    }

    const featurePatch: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(features ?? {})) {
      if (!VALID_FEATURES.includes(key)) {
        return badRequest(`Invalid feature key: ${key}. Valid keys: ${VALID_FEATURES.join(', ')}`);
      }
      if (typeof value !== 'boolean') {
        return badRequest(`Feature value for ${key} must be a boolean`);
      }
      featurePatch[key] = value;
    }

    let tickerPatch: Partial<TickerSettings> | undefined;
    if (ticker) {
      const parsed = parseTickerPatch(ticker);
      if ('error' in parsed) return badRequest(parsed.error);
      tickerPatch = parsed.patch;
    }

    const { user: { siteConfig } } = getRepositories();
    const [updatedFeatures, updatedTicker] = await Promise.all([
      features ? siteConfig.updateFeatures(featurePatch) : siteConfig.getFeatures(),
      tickerPatch ? siteConfig.updateTickerSettings(tickerPatch) : siteConfig.getTickerSettings(),
    ]);

    return success({ features: updatedFeatures, ticker: updatedTicker });
  } catch (error) {
    console.error('Update site config error:', error);
    return serverError('Failed to update site configuration');
  }
};
