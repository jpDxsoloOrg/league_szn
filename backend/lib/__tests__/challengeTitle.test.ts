import { describe, it, expect } from 'vitest';
import type { Championship } from '../repositories/types';
import { challengeTitleFitError, isTagFormat, titleAvailabilityError, titleFormatError } from '../challengeTitle';

const title = (overrides: Partial<Championship> = {}): Championship => ({
  championshipId: 'title-1', name: 'World Title', type: 'singles', createdAt: '', updatedAt: '', ...overrides,
});

const singles = { challengeMode: 'singles' as const, matchType: 'Singles', sides: [[{ playerId: 'p1' }], [{ playerId: 'p2' }]] };
const tag = {
  challengeMode: 'tag_team' as const,
  matchType: 'Tag Team',
  sides: [[{ playerId: 'a1' }, { playerId: 'a2' }], [{ playerId: 'b1' }, { playerId: 'b2' }]],
};

describe('isTagFormat', () => {
  it('matches the word tag in any case', () => {
    expect(isTagFormat('Tornado TAG')).toBe(true);
    expect(isTagFormat('Triple Threat')).toBe(false);
  });
});

describe('titleFormatError', () => {
  it('accepts a format that suits the title', () => {
    expect(titleFormatError('singles', 'Triple Threat')).toBeNull();
    expect(titleFormatError('tag', 'Tag Team')).toBeNull();
  });

  it('rejects a format that does not', () => {
    expect(titleFormatError('singles', 'Tag Team')).toBe('A singles title cannot be decided in a tag team match');
    expect(titleFormatError('tag', 'Singles')).toBe('A tag team title needs a tag team match type');
  });
});

describe('titleAvailabilityError', () => {
  it('reports a missing or inactive title', () => {
    expect(titleAvailabilityError(null)).toBe('Championship not found');
    expect(titleAvailabilityError(title({ isActive: false }))).toBe('This championship is inactive and cannot be challenged for');
  });

  it('accepts an active title', () => {
    expect(titleAvailabilityError(title({ isActive: true }))).toBeNull();
  });
});

describe('challengeTitleFitError', () => {
  it('accepts a title held by either side, or a vacant one', () => {
    expect(challengeTitleFitError(title({ currentChampion: 'p2' }), singles)).toBeNull();
    expect(challengeTitleFitError(title({ currentChampion: 'p1' }), singles)).toBeNull();
    expect(challengeTitleFitError(title(), singles)).toBeNull();
    expect(challengeTitleFitError(title({ type: 'tag', currentChampion: ['b2', 'b1'] }), tag)).toBeNull();
  });

  it('rejects the wrong kind of title for the challenge', () => {
    expect(challengeTitleFitError(title({ type: 'tag' }), singles))
      .toBe('A tag team title can only be challenged for in a tag team challenge');
    expect(challengeTitleFitError(title(), tag))
      .toBe('A singles title cannot be challenged for in a tag team challenge');
  });

  it('rejects a match type that does not suit the title', () => {
    expect(challengeTitleFitError(title(), { ...singles, matchType: 'Tag Team' }))
      .toBe('A singles title cannot be decided in a tag team match');
    expect(challengeTitleFitError(title({ type: 'tag' }), { ...tag, matchType: 'Singles' }))
      .toBe('A tag team title needs a tag team match type');
  });

  it('rejects a title held by someone outside the challenge', () => {
    const message = 'The current champion must be part of a challenge for their title';
    expect(challengeTitleFitError(title({ currentChampion: 'p9' }), singles)).toBe(message);
    // One holder from each team is not a side holding the belts.
    expect(challengeTitleFitError(title({ type: 'tag', currentChampion: ['a1', 'b1'] }), tag)).toBe(message);
  });

  it('rejects a division-locked title when someone is outside the division', () => {
    const sides = [[{ playerId: 'p1', divisionId: 'd1' }], [{ playerId: 'p2', divisionId: 'd2' }]];
    expect(challengeTitleFitError(title({ divisionId: 'd1' }), { ...singles, sides }))
      .toBe('Everyone in the challenge must be in the division this title is locked to');
  });
});
