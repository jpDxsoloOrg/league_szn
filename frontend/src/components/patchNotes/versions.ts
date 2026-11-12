/**
 * Semantic versions for patch-notes releases: MAJOR.MINOR.PATCH, no
 * pre-release or build suffixes. A feature release bumps MINOR, a
 * fixes-only release bumps PATCH.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

export type BumpKind = 'minor' | 'patch';

const VERSION_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Parses "1.1.0" or "v1.1.0". Returns null for anything else. */
export function parseVersion(input: string): Version | null {
  const match = VERSION_PATTERN.exec(input.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function isValidVersion(input: string): boolean {
  return parseVersion(input) !== null;
}

export function formatVersion(version: Version): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function requireVersion(input: string): Version {
  const parsed = parseVersion(input);
  if (!parsed) throw new Error(`Invalid version: "${input}"`);
  return parsed;
}

/** Negative when a < b, zero when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const left = requireVersion(a);
  const right = requireVersion(b);
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

/** The version that follows `latest` for a feature (minor) or fixes-only (patch) release. */
export function nextVersion(latest: string, kind: BumpKind): string {
  const current = requireVersion(latest);
  if (kind === 'minor') {
    return formatVersion({ major: current.major, minor: current.minor + 1, patch: 0 });
  }
  return formatVersion({ ...current, patch: current.patch + 1 });
}

/** "1.1.0" -> "v1.1.0", the form used in URLs and badges. */
export function versionSlug(version: string): string {
  return `v${version.replace(/^v/, '')}`;
}
