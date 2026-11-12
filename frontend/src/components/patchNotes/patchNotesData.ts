import { useEffect, useState } from 'react';
import { compareVersions, parseVersion, versionSlug } from './versions';

export const PATCH_NOTES_ROOT = '/patch-notes';

export interface PatchNotesRelease {
  /** MAJOR.MINOR.PATCH, without the leading "v". */
  version: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** English title. Also the fallback when there is no German one. */
  title: string;
  titleDe?: string;
  /** Markdown file under /patch-notes/ (and /patch-notes/de/ for German). */
  file: string;
  /** English one-line summary for the version list. */
  summary: string;
  summaryDe?: string;
}

export interface PatchNotesIndex {
  /** Newest first. */
  releases: PatchNotesRelease[];
  next?: { file: string };
}

export type PatchNotesLocale = 'en' | 'de';

/**
 * Titles and summaries live in index.json, not in the translation bundle, so
 * a new release never needs a code change and a tab on an older bundle still
 * reads them. German falls back to English when a field is missing.
 */
export function releaseTitle(release: PatchNotesRelease, locale: PatchNotesLocale): string {
  return locale === 'de' ? release.titleDe ?? release.title : release.title;
}

export function releaseSummary(release: PatchNotesRelease, locale: PatchNotesLocale): string {
  return locale === 'de' ? release.summaryDe ?? release.summary : release.summary;
}

export function releasePath(release: PatchNotesRelease): string {
  return `${PATCH_NOTES_ROOT}/${versionSlug(release.version)}`;
}

/** Finds the release for a URL segment like "v1.1.0" (or "1.1.0"). */
export function findRelease(releases: PatchNotesRelease[], param: string): PatchNotesRelease | undefined {
  if (!parseVersion(param)) return undefined;
  return releases.find(
    (release) => parseVersion(release.version) !== null && compareVersions(release.version, param) === 0
  );
}

/** "2026-11-12" in the reader's language, pinned to UTC so the day never shifts. */
export function formatReleaseDate(date: string, locale: PatchNotesLocale): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(parsed);
}

function isPatchNotesIndex(value: unknown): value is PatchNotesIndex {
  if (typeof value !== 'object' || value === null) return false;
  const releases = (value as { releases?: unknown }).releases;
  return Array.isArray(releases);
}

/** The SPA answers unknown paths with index.html, which is never valid markdown. */
function isHtmlResponse(text: string): boolean {
  const start = text.trim().toLowerCase();
  return start.startsWith('<!doctype') || start.startsWith('<html');
}

async function fetchMarkdown(path: string): Promise<string | null> {
  const response = await fetch(path);
  if (!response.ok) return null;
  const text = await response.text();
  return isHtmlResponse(text) ? null : text;
}

export interface LocalizedMarkdown {
  content: string;
  /** True when German was asked for but only the English file exists. */
  fromFallback: boolean;
}

export async function fetchLocalizedMarkdown(file: string, locale: PatchNotesLocale): Promise<LocalizedMarkdown> {
  if (locale === 'de') {
    const german = await fetchMarkdown(`${PATCH_NOTES_ROOT}/de/${file}`);
    if (german !== null) return { content: german, fromFallback: false };
  }
  const english = await fetchMarkdown(`${PATCH_NOTES_ROOT}/${file}`);
  if (english === null) throw new Error(`Patch notes file not found: ${file}`);
  return { content: english, fromFallback: locale === 'de' };
}

interface IndexState {
  index: PatchNotesIndex | null;
  loading: boolean;
  failed: boolean;
}

export function usePatchNotesIndex(): IndexState {
  const [state, setState] = useState<IndexState>({ index: null, loading: true, failed: false });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${PATCH_NOTES_ROOT}/index.json`);
        if (!response.ok) throw new Error('Failed to load patch notes');
        const data: unknown = await response.json();
        if (!isPatchNotesIndex(data)) throw new Error('Invalid patch notes index');
        if (!cancelled) setState({ index: data, loading: false, failed: false });
      } catch {
        if (!cancelled) setState({ index: null, loading: false, failed: true });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

interface MarkdownState {
  markdown: LocalizedMarkdown | null;
  loading: boolean;
  failed: boolean;
}

/** Loads a patch-notes markdown file in the reader's language. Pass null to load nothing. */
export function usePatchNotesMarkdown(file: string | null, locale: PatchNotesLocale): MarkdownState {
  const [state, setState] = useState<MarkdownState>({ markdown: null, loading: file !== null, failed: false });

  useEffect(() => {
    if (file === null) {
      setState({ markdown: null, loading: false, failed: false });
      return;
    }
    let cancelled = false;
    setState({ markdown: null, loading: true, failed: false });
    const load = async () => {
      try {
        const markdown = await fetchLocalizedMarkdown(file, locale);
        if (!cancelled) setState({ markdown, loading: false, failed: false });
      } catch {
        if (!cancelled) setState({ markdown: null, loading: false, failed: true });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [file, locale]);

  return state;
}
