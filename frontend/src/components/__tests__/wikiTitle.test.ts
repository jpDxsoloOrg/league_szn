import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { humanizeSlug, wikiTitle, type WikiArticleEntry } from '../wikiNav';
import en from '../../i18n/locales/en.json';

/** Mimics i18next: known keys translate, unknown keys return the defaultValue. */
const makeT = (known: Record<string, string>) => (key: string, options: { defaultValue: string }) =>
  known[key] ?? options.defaultValue;

const entry = {
  slug: 'call-ups',
  titleKey: 'wiki.articles.callUps',
  title: 'Call-Ups: Young Boys to the Main Roster',
};

describe('wikiTitle', () => {
  it('uses the translation when the bundle knows the key', () => {
    const t = makeT({ 'wiki.articles.callUps': 'Call-Ups: Von den Young Boys in den Hauptkader' });
    expect(wikiTitle(t, entry)).toBe('Call-Ups: Von den Young Boys in den Hauptkader');
  });

  it('falls back to the index title instead of the raw key (stale bundle)', () => {
    expect(wikiTitle(makeT({}), entry)).toBe('Call-Ups: Young Boys to the Main Roster');
  });

  it('falls back to the humanized slug when the entry has no title', () => {
    expect(wikiTitle(makeT({}), { slug: 'call-ups', titleKey: 'wiki.articles.callUps' })).toBe('Call Ups');
  });

  it('uses an override key such as navTitleKey', () => {
    const t = makeT({ 'wiki.nav.short': 'Short' });
    expect(wikiTitle(t, entry, 'wiki.nav.short')).toBe('Short');
  });

  it('humanizes slugs', () => {
    expect(humanizeSlug('rivalry-heat-explained')).toBe('Rivalry Heat Explained');
  });
});

describe('wiki index.json', () => {
  const index = JSON.parse(
    readFileSync(join(__dirname, '../../../public/wiki/index.json'), 'utf8')
  ) as WikiArticleEntry[];

  const lookup = (key: string): unknown =>
    key.split('.').reduce<unknown>(
      (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
      en
    );

  it('gives every entry an English fallback title matching en.json', () => {
    for (const article of index) {
      expect(article.title, article.slug).toBe(lookup(article.titleKey));
    }
  });
});
