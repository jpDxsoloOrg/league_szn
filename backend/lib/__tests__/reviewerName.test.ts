import { describe, it, expect } from 'vitest';
import { createReviewerNameLookup, UNKNOWN_REVIEWER } from '../reviewerName';

const reviewerSub = '44487408-d061-7064-ee50-c331bb108486';

describe('createReviewerNameLookup', () => {
  const reviewerName = createReviewerNameLookup([{ userId: reviewerSub, name: 'The GM' }]);

  it('resolves a stored id to the linked player', () => {
    expect(reviewerName(reviewerSub)).toBe('The GM');
  });

  it('never returns an id with no linked player', () => {
    expect(reviewerName('9277aa8e-6517-4362-a95a-749e10615306')).toBe(UNKNOWN_REVIEWER);
  });

  it('keeps an older readable username', () => {
    expect(reviewerName('admin')).toBe('admin');
  });

  it('leaves an unreviewed request empty', () => {
    expect(reviewerName(undefined)).toBeUndefined();
  });
});
