import { describe, it, expect } from 'vitest';
import { getProfileSetupGaps, hasSetupGaps, isProfileSetupExcludedPath } from '../profileSetup';

const move = (gameName: string) => ({ gameName, customName: '' });

describe('getProfileSetupGaps', () => {
  it('flags the Needs Wrestler placeholder (case-insensitive) and empty movesets', () => {
    expect(getProfileSetupGaps({ currentWrestler: 'needs wrestler' })).toEqual({
      needsWrestler: true,
      needsSignature: true,
      needsFinisher: true,
    });
  });

  it('is satisfied by a wrestler plus one named signature and finisher', () => {
    const gaps = getProfileSetupGaps({
      currentWrestler: 'Cody Rhodes',
      signatures: [move('Cody Cutter')],
      finishers: [move('Cross Rhodes')],
    });
    expect(gaps).toEqual({ needsWrestler: false, needsSignature: false, needsFinisher: false });
    expect(hasSetupGaps(gaps)).toBe(false);
  });

  it('ignores blank-name rows', () => {
    const gaps = getProfileSetupGaps({
      currentWrestler: 'Cody Rhodes',
      signatures: [move('  ')],
      finishers: [move('Cross Rhodes')],
    });
    expect(gaps.needsSignature).toBe(true);
    expect(gaps.needsFinisher).toBe(false);
    expect(hasSetupGaps(gaps)).toBe(true);
  });
});

describe('isProfileSetupExcludedPath', () => {
  it('excludes the profile and auth routes, including nested paths', () => {
    expect(isProfileSetupExcludedPath('/profile')).toBe(true);
    expect(isProfileSetupExcludedPath('/login')).toBe(true);
    expect(isProfileSetupExcludedPath('/welcome')).toBe(true);
    expect(isProfileSetupExcludedPath('/profile/anything')).toBe(true);
    expect(isProfileSetupExcludedPath('/')).toBe(false);
    expect(isProfileSetupExcludedPath('/profiles')).toBe(false);
    expect(isProfileSetupExcludedPath('/events/1')).toBe(false);
  });
});
