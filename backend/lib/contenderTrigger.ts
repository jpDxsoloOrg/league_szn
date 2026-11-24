import { invokeAsync } from './asyncLambda';

/**
 * Fire-and-forget request to recalculate every title's contender rankings.
 * Never throws: rankings are eventually consistent (the scheduled job and the
 * admin recalculate repair a missed trigger), so a failed invoke must not fail
 * the request that caused it.
 */
export async function triggerContenderRecalculation(source: string): Promise<void> {
  try {
    await invokeAsync('contenders', { source });
  } catch (err) {
    console.warn(`Failed to invoke contender recalculation (${source}):`, err);
  }
}
