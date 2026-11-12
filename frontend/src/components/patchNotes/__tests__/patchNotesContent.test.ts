import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PatchNotesIndex } from '../patchNotesData';
import { compareVersions, isValidVersion } from '../versions';

const patchNotesRoot = join(process.cwd(), 'public/patch-notes');
const wikiRoot = join(process.cwd(), 'public/wiki');
const index = JSON.parse(readFileSync(join(patchNotesRoot, 'index.json'), 'utf8')) as PatchNotesIndex;
const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
const releases = index.releases;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') && entry.name !== 'README.md' ? [path] : [];
  });
}

describe('patch notes index', () => {
  it('has at least one release', () => {
    expect(releases.length).toBeGreaterThan(0);
  });

  it('uses valid MAJOR.MINOR.PATCH versions', () => {
    expect(releases.filter((release) => !isValidVersion(release.version) || release.version.startsWith('v'))).toEqual([]);
  });

  it('never repeats a version', () => {
    const versions = releases.map((release) => release.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('lists releases strictly newest first by version', () => {
    releases.slice(1).forEach((release, position) => {
      const newer = releases[position]!;
      expect(compareVersions(newer.version, release.version), `${newer.version} before ${release.version}`).toBeGreaterThan(0);
    });
  });

  it('has valid dates that never increase down the list', () => {
    releases.forEach((release) => {
      expect(release.date).toMatch(ISO_DATE);
      expect(Number.isNaN(new Date(`${release.date}T00:00:00Z`).getTime())).toBe(false);
    });
    releases.slice(1).forEach((release, position) => {
      expect(releases[position]!.date >= release.date, `${releases[position]!.version} dated before ${release.version}`).toBe(true);
    });
  });

  it('gives every release an English title and summary', () => {
    releases.forEach((release) => {
      expect(release.title.trim()).not.toBe('');
      expect(release.summary.trim()).not.toBe('');
    });
  });

  it('points every release and the Coming Next section at a file that exists', () => {
    const files = [...releases.map((release) => release.file), ...(index.next ? [index.next.file] : [])];
    expect(files.filter((file) => !existsSync(join(patchNotesRoot, file)))).toEqual([]);
  });

  it('keeps frontend/package.json on the latest release version', () => {
    expect(packageJson.version).toBe(releases[0]!.version);
  });
});

describe('patch notes links', () => {
  const wikiSlugs = new Set(
    (JSON.parse(readFileSync(join(wikiRoot, 'index.json'), 'utf8')) as { slug: string }[]).map((entry) => entry.slug)
  );

  it('only links to wiki articles that exist', () => {
    const broken = markdownFiles(patchNotesRoot).flatMap((file) => {
      const markdown = readFileSync(file, 'utf8');
      return [...markdown.matchAll(/\]\(\/guide\/wiki\/([^)#\s]+)/g)]
        .map((link) => link[1]!)
        .filter((slug) => !wikiSlugs.has(slug))
        .map((slug) => `${file.slice(patchNotesRoot.length + 1)} -> ${slug}`);
    });
    expect(broken).toEqual([]);
  });

  it('only references screenshots that exist under public/', () => {
    const publicRoot = join(process.cwd(), 'public');
    const missing = markdownFiles(patchNotesRoot).flatMap((file) => {
      const markdown = readFileSync(file, 'utf8');
      return [...markdown.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g)]
        .map((image) => image[1]!)
        .filter((src) => !src.startsWith('/') || !existsSync(join(publicRoot, src)))
        .map((src) => `${file.slice(patchNotesRoot.length + 1)} -> ${src}`);
    });
    expect(missing).toEqual([]);
  });

  it('keeps screenshots under images/vX.Y.Z/ as WebP or PNG below 200 KB', () => {
    const imagesRoot = join(patchNotesRoot, 'images');
    if (!existsSync(imagesRoot)) return;
    const problems = readdirSync(imagesRoot, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory() || !/^v\d+\.\d+\.\d+$/.test(entry.name)) return [`images/${entry.name} is not a vX.Y.Z folder`];
      const folder = join(imagesRoot, entry.name);
      return readdirSync(folder).flatMap((name) => {
        const path = join(folder, name);
        const issues: string[] = [];
        if (!/\.(webp|png)$/.test(name)) issues.push(`${entry.name}/${name} is not WebP or PNG`);
        if (statSync(path).size > 200 * 1024) issues.push(`${entry.name}/${name} is over 200 KB`);
        return issues;
      });
    });
    expect(problems).toEqual([]);
  });

  it('never links the public patch notes to staff-only wiki articles', () => {
    const staffOnly = new Set(
      (JSON.parse(readFileSync(join(wikiRoot, 'index.json'), 'utf8')) as { slug: string; adminOnly?: boolean }[])
        .filter((entry) => entry.adminOnly)
        .map((entry) => entry.slug)
    );
    const staffLinks = markdownFiles(patchNotesRoot).flatMap((file) => {
      const markdown = readFileSync(file, 'utf8');
      return [...markdown.matchAll(/\]\(\/guide\/wiki\/([^)#\s]+)/g)]
        .map((link) => link[1]!)
        .filter((slug) => staffOnly.has(slug))
        .map((slug) => `${file.slice(patchNotesRoot.length + 1)} -> ${slug}`);
    });
    expect(staffLinks).toEqual([]);
  });
});
