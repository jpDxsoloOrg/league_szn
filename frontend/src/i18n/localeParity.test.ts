import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import de from './locales/de.json';

type LocaleTree = { [key: string]: string | LocaleTree };

/**
 * Keys known to be incomplete today. These lists may only shrink: an entry
 * that stops being true fails the test, so remove it when the key is added.
 */
const MISSING_FROM_GERMAN: string[] = [];

const MISSING_FROM_ENGLISH: string[] = [];

/** Keys read by source code that neither locale defines; they render their default text. */
const UNDEFINED_SOURCE_KEYS = [
  'admin.standaloneMatches.description',
  'admin.standaloneMatches.empty',
  'admin.standaloneMatches.scheduleLink',
  'admin.standaloneMatches.title',
  'contenders.admin.noChampionships',
  'rivalries.messages.audienceAria',
  'rivalries.messages.audiencePill',
  'rivalries.messages.feedError',
  'rivalries.messages.headerContext',
  'rivalries.messages.reminder',
  'rivalries.messages.retry',
  'rivalries.notes.suggestionHint',
  'rivalries.request.adminOnly',
  'rivalries.request.instigator',
  'rivalries.request.rival',
  'rivalries.request.whichWrestler',
  'scheduleMatch.eventHint',
  'scheduleMatch.slotDuplicatePlayerError',
];

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

/** Matches t('section.key'); dynamic keys cannot be checked statically. */
const STATIC_KEY_PATTERN = /(?<![\w.])t\(\s*['"]([A-Za-z][\w-]*(?:\.[\w-]+)+)['"]/g;

function leafKeys(tree: LocaleTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : leafKeys(value, `${prefix}${key}.`),
  );
}

function difference(left: Iterable<string>, right: Set<string>): string[] {
  return [...left].filter((key) => !right.has(key)).sort();
}

function sourceKeys(): Set<string> {
  const modules = import.meta.glob<string>(
    ['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../**/__tests__/**', '!../test/**'],
    { query: '?raw', import: 'default', eager: true },
  );
  const found = new Set<string>();
  for (const source of Object.values(modules)) {
    for (const match of source.matchAll(STATIC_KEY_PATTERN)) {
      found.add(match[1]);
    }
  }
  return found;
}

describe('locale parity', () => {
  const englishKeys = new Set(leafKeys(en));
  const germanKeys = new Set(leafKeys(de));

  it('defines every English key in German, apart from the allowlist', () => {
    expect(difference(englishKeys, germanKeys)).toEqual([...MISSING_FROM_GERMAN].sort());
  });

  it('defines every German key in English, apart from the allowlist', () => {
    expect(difference(germanKeys, englishKeys)).toEqual([...MISSING_FROM_ENGLISH].sort());
  });

  it('defines every static key read by source code, apart from the allowlist', () => {
    const isDefined = (key: string) =>
      englishKeys.has(key) ||
      germanKeys.has(key) ||
      PLURAL_SUFFIXES.some((suffix) => englishKeys.has(`${key}${suffix}`));
    const undefinedKeys = [...sourceKeys()].filter((key) => !isDefined(key)).sort();

    expect(undefinedKeys).toEqual([...UNDEFINED_SOURCE_KEYS].sort());
  });
});
