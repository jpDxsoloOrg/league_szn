import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

interface WikiEntry {
  slug: string;
  file: string;
  adminOnly?: boolean;
}

const wikiRoot = join(process.cwd(), 'public/wiki');
const entries = JSON.parse(readFileSync(join(wikiRoot, 'index.json'), 'utf8')) as WikiEntry[];
const staffSlugs = new Set(entries.filter((entry) => entry.adminOnly).map((entry) => entry.slug));
const memberArticles = entries.filter((entry) => !entry.adminOnly);

const linkedSlugs = (markdown: string): string[] =>
  [...markdown.matchAll(/\]\(([^)#\s]+)/g)].flatMap((link) => link[1] ?? []);

describe('wiki links', () => {
  it.each(['', 'de'])('member articles in "%s" never send readers to a staff-only article', (locale) => {
    const deadEnds = memberArticles.flatMap((entry) => {
      const markdown = readFileSync(join(wikiRoot, locale, entry.file), 'utf8');
      return linkedSlugs(markdown)
        .filter((slug) => staffSlugs.has(slug))
        .map((slug) => `${entry.file} -> ${slug}`);
    });

    expect(deadEnds).toEqual([]);
  });
});
