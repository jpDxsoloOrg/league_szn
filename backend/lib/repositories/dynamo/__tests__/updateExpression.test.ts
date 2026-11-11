import { describe, expect, it } from 'vitest';
import { buildUpdateExpression } from '../util';
import { buildUpdateExpression as buildLegacyUpdateExpression } from '../../../dynamodb';

const NOW = '2026-11-06T12:00:00.000Z';

const countUpdatedAt = (expression: string): number =>
  expression.split('#updatedAt =').length - 1;

describe('update expressions', () => {
  it('sets updatedAt once when the patch also carries it', () => {
    const result = buildUpdateExpression({ status: 'cancelled', updatedAt: 'stale' }, NOW);

    expect(countUpdatedAt(result.UpdateExpression)).toBe(1);
    expect(result.ExpressionAttributeValues[':updatedAt']).toBe(NOW);
    expect(result.hasChanges).toBe(true);
  });

  it('does not count updatedAt alone as a change', () => {
    expect(buildUpdateExpression({ updatedAt: 'stale' }, NOW).hasChanges).toBe(false);
  });

  it('sets updatedAt once in the shared helper too', () => {
    const result = buildLegacyUpdateExpression(
      { status: 'cancelled', updatedAt: 'stale' },
      { updatedAtValue: NOW },
    );

    expect(countUpdatedAt(result.UpdateExpression)).toBe(1);
    expect(result.ExpressionAttributeValues?.[':updatedAt']).toBe(NOW);
  });

  it('keeps a caller value when the shared helper is not adding its own', () => {
    const result = buildLegacyUpdateExpression(
      { updatedAt: 'kept' },
      { includeUpdatedAt: false },
    );

    expect(result.ExpressionAttributeValues?.[':updatedAt']).toBe('kept');
  });
});
