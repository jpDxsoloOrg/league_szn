import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PatchNotesIndex } from '../patchNotesData';

const { language } = vi.hoisted(() => ({ language: { current: 'en' } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { version?: string }) => (options?.version ? `${key}:${options.version}` : key),
    i18n: { language: language.current },
  }),
}));

import PatchNotes from '../PatchNotes';

const INDEX: PatchNotesIndex = {
  releases: [
    {
      version: '1.2.0',
      date: '2026-12-01',
      title: 'Promotion Ladder',
      titleDe: 'Aufstiegsleiter',
      file: 'v1.2.0.md',
      summary: 'Divisions get tiers.',
      summaryDe: 'Divisionen bekommen Stufen.',
    },
    {
      version: '1.1.0',
      date: '2026-11-12',
      title: 'Tag Team Contenders',
      file: 'v1.1.0.md',
      summary: 'Tag titles rank teams.',
    },
  ],
  next: { file: 'next-features.md' },
};

const FILES: Record<string, string> = {
  '/patch-notes/v1.2.0.md': '## Ladder\n\nClimb it. [Divisions](/guide/wiki/divisions)',
  '/patch-notes/de/v1.2.0.md': '## Leiter\n\nKletter hoch.',
  '/patch-notes/v1.1.0.md': '## Teams\n\nTag teams are ranked.',
  '/patch-notes/next-features.md': '## Promotion & Relegation\n\nComing soon.',
  '/patch-notes/de/next-features.md': '## Auf- und Abstieg\n\nBald.',
};

function mockFetch(index: PatchNotesIndex | null = INDEX) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/patch-notes/index.json') {
      return index ? new Response(JSON.stringify(index), { status: 200 }) : new Response('', { status: 500 });
    }
    const body = FILES[url];
    return body !== undefined ? new Response(body, { status: 200 }) : new Response('Not found', { status: 404 });
  }) as typeof fetch;
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/patch-notes" element={<PatchNotes />} />
        <Route path="/patch-notes/:version" element={<PatchNotes />} />
        <Route path="*" element={null} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('PatchNotes', () => {
  beforeEach(() => {
    language.current = 'en';
    mockFetch();
  });

  it('opens on the latest release', async () => {
    renderAt('/patch-notes');
    const post = await screen.findByRole('article');
    expect(within(post).getByRole('heading', { level: 2, name: 'Promotion Ladder' })).toBeInTheDocument();
    expect(within(post).getByText('v1.2.0')).toBeInTheDocument();
    expect(within(post).getByText('patchNotes.latest')).toBeInTheDocument();
    expect(within(post).getByText('December 1, 2026')).toHaveAttribute('dateTime', '2026-12-01');
    expect(await within(post).findByRole('heading', { name: 'Ladder' })).toBeInTheDocument();
  });

  it('opens a specific version from the URL', async () => {
    renderAt('/patch-notes/v1.1.0');
    const post = await screen.findByRole('article');
    expect(within(post).getByRole('heading', { level: 2, name: 'Tag Team Contenders' })).toBeInTheDocument();
    expect(within(post).queryByText('patchNotes.latest')).not.toBeInTheDocument();
    expect(await within(post).findByText('Tag teams are ranked.')).toBeInTheDocument();
  });

  it('shows an empty state with a way back for an unknown version', async () => {
    renderAt('/patch-notes/v9.9.9');
    expect(await screen.findByText('patchNotes.notFound.title')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'patchNotes.notFound.action:v1.2.0' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/patch-notes$/));
  });

  it('treats a malformed version as unknown', async () => {
    renderAt('/patch-notes/latest');
    expect(await screen.findByText('patchNotes.notFound.title')).toBeInTheDocument();
  });

  it('lists every version with a link to its page', async () => {
    renderAt('/patch-notes/v1.1.0');
    const versions = await screen.findByRole('complementary', { name: 'patchNotes.versions' });
    const links = within(versions).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/patch-notes/v1.2.0', '/patch-notes/v1.1.0']);
    expect(links[1]).toHaveAttribute('aria-current', 'page');
    expect(links[0]).not.toHaveAttribute('aria-current');
    expect(within(links[0]!).getByText('Divisions get tiers.')).toBeInTheDocument();
    expect(within(links[1]!).getByText('Tag Team Contenders')).toBeInTheDocument();

    fireEvent.click(links[0]!);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/patch-notes/v1.2.0'));
  });

  it('renders the Coming Next section', async () => {
    renderAt('/patch-notes');
    const section = await screen.findByRole('region', { name: 'patchNotes.comingNext' });
    expect(await within(section).findByRole('heading', { name: 'Promotion & Relegation' })).toBeInTheDocument();
  });

  it('routes internal markdown links through the router', async () => {
    renderAt('/patch-notes');
    const post = await screen.findByRole('article');
    const link = await within(post).findByRole('link', { name: 'Divisions' });
    expect(link).toHaveAttribute('href', '/guide/wiki/divisions');
    expect(link).not.toHaveAttribute('target');
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/guide/wiki/divisions'));
  });

  it('uses German files, titles and summaries when the language is German', async () => {
    language.current = 'de';
    renderAt('/patch-notes');
    const post = await screen.findByRole('article');
    expect(within(post).getByRole('heading', { level: 2, name: 'Aufstiegsleiter' })).toBeInTheDocument();
    expect(await within(post).findByRole('heading', { name: 'Leiter' })).toBeInTheDocument();
    expect(within(post).queryByText('patchNotes.showingEnglishFallback')).not.toBeInTheDocument();
    expect(screen.getByText('Divisionen bekommen Stufen.')).toBeInTheDocument();
  });

  it('falls back to English when the German file is missing', async () => {
    language.current = 'de';
    renderAt('/patch-notes/v1.1.0');
    const post = await screen.findByRole('article');
    expect(await within(post).findByText('Tag teams are ranked.')).toBeInTheDocument();
    expect(within(post).getByText('patchNotes.showingEnglishFallback')).toBeInTheDocument();
    // No German title in the index: the English one is shown.
    expect(within(post).getByRole('heading', { level: 2, name: 'Tag Team Contenders' })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/patch-notes/de/v1.1.0.md');
    expect(global.fetch).toHaveBeenCalledWith('/patch-notes/v1.1.0.md');
  });

  it('shows an empty state when the index cannot be loaded', async () => {
    mockFetch(null);
    renderAt('/patch-notes');
    expect(await screen.findByText('patchNotes.loadFailed')).toBeInTheDocument();
  });
});
