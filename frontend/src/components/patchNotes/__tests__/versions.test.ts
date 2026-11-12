import { describe, expect, it } from 'vitest';
import { compareVersions, isValidVersion, nextVersion, parseVersion, versionSlug } from '../versions';

describe('parseVersion', () => {
  it('parses MAJOR.MINOR.PATCH with or without a leading v', () => {
    expect(parseVersion('1.1.0')).toEqual({ major: 1, minor: 1, patch: 0 });
    expect(parseVersion('v12.0.3')).toEqual({ major: 12, minor: 0, patch: 3 });
  });

  it.each(['', '1', '1.1', '1.1.0.0', '01.1.0', '1.1.0-beta', 'v', 'x.y.z', '1.-1.0'])(
    'rejects "%s"',
    (input) => {
      expect(parseVersion(input)).toBeNull();
      expect(isValidVersion(input)).toBe(false);
    }
  );
});

describe('compareVersions', () => {
  it('orders numerically, not as strings', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.1.0', '1.1.1')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('v1.1.0', '1.1.0')).toBe(0);
  });

  it('sorts a list newest first', () => {
    const sorted = ['1.0.1', '1.2.0', '1.1.0', '1.10.0'].sort((a, b) => compareVersions(b, a));
    expect(sorted).toEqual(['1.10.0', '1.2.0', '1.1.0', '1.0.1']);
  });

  it('throws on an invalid version', () => {
    expect(() => compareVersions('1.1', '1.1.0')).toThrow('Invalid version');
  });
});

describe('nextVersion', () => {
  it('bumps minor and resets patch for a feature release', () => {
    expect(nextVersion('1.1.0', 'minor')).toBe('1.2.0');
    expect(nextVersion('1.2.3', 'minor')).toBe('1.3.0');
  });

  it('bumps patch for a fixes-only release', () => {
    expect(nextVersion('1.1.0', 'patch')).toBe('1.1.1');
  });

  it('throws on an invalid version', () => {
    expect(() => nextVersion('latest', 'patch')).toThrow('Invalid version');
  });
});

describe('versionSlug', () => {
  it('adds exactly one leading v', () => {
    expect(versionSlug('1.1.0')).toBe('v1.1.0');
    expect(versionSlug('v1.1.0')).toBe('v1.1.0');
  });
});
