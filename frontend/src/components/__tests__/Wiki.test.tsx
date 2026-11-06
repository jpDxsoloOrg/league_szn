import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';

const { mockUseTranslation } = vi.hoisted(() => ({
  mockUseTranslation: vi.fn(() => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  })),
}));
const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(() => ({
    isAdminOrModerator: false,
    isAuthenticated: false,
    isLoading: false,
    hasRole: () => false,
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => mockUseTranslation(),
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import { WikiLayout } from '../Wiki';
import WikiIndex from '../WikiIndex';
import WikiArticle from '../WikiArticle';

function renderWikiRoutes(initialRoute = '/guide/wiki') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/guide" element={<Navigate to="/guide/wiki" replace />} />
        <Route path="/guide/wiki" element={<WikiLayout />}>
          <Route index element={<WikiIndex />} />
          <Route path=":slug" element={<WikiArticle />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Wiki', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('WikiLayout shows breadcrumbs with no link back to the page itself', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    renderWikiRoutes();
    const nav = screen.getByRole('navigation', { name: 'wiki.breadcrumbNav' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('wiki.breadcrumb.help')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'wiki.breadcrumb.help' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'wiki.backToGuide' })).not.toBeInTheDocument();
  });

  it('WikiIndex fetches index and shows article links', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { slug: 'getting-started', titleKey: 'wiki.articles.gettingStarted', file: 'getting-started.md' },
        { slug: 'faqs', titleKey: 'wiki.articles.faqs', file: 'faqs.md' },
      ],
    });
    renderWikiRoutes();
    await waitFor(() => {
      expect(screen.getByText('wiki.articles.gettingStarted')).toBeInTheDocument();
      expect(screen.getByText('wiki.articles.faqs')).toBeInTheDocument();
    });
    const gettingStartedLink = screen.getByRole('link', { name: 'wiki.articles.gettingStarted' });
    expect(gettingStartedLink).toHaveAttribute('href', '/guide/wiki/getting-started');
  });

  it('links an article back to the wiki index from the breadcrumb', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => (
      url.endsWith('.json')
        ? { ok: true, json: async () => [{ slug: 'faqs', titleKey: 'wiki.articles.faqs', file: 'faqs.md' }] }
        : { ok: true, text: async () => '# FAQ', headers: new Headers({ 'content-type': 'text/markdown' }) }
    ));
    renderWikiRoutes('/guide/wiki/faqs');
    expect(await screen.findByRole('link', { name: 'wiki.breadcrumb.help' })).toHaveAttribute('href', '/guide/wiki');
  });

  it('explains a bad article link instead of showing a raw error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => (
      url.endsWith('.json') ? { ok: true, json: async () => [] } : { ok: false, status: 404, text: async () => '' }
    ));
    renderWikiRoutes('/guide/wiki/nope');
    expect(await screen.findByRole('heading', { name: 'wiki.articleNotFound' })).toBeInTheDocument();
    expect(screen.queryByText(/common.error/)).not.toBeInTheDocument();
    expect(screen.queryByText('nope')).not.toBeInTheDocument();
  });

  it('does not render HTML as content when German path returns index.html and fallback returns markdown', async () => {
    mockUseTranslation.mockReturnValue({
      t: (key: string) => key,
      i18n: { language: 'de' },
    });
    const adminIndex = [
      { slug: 'admin', titleKey: 'wiki.articles.adminGuide', file: 'admin.md', adminOnly: true },
    ];
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(adminIndex) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(adminIndex) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(adminIndex) })
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve('<!doctype html><html lang="en"><body>SPA</body></html>'),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('# Admin Guide\n\nContent here.'),
      });
    mockUseAuth.mockReturnValue({
      isAdminOrModerator: true,
      isAuthenticated: true,
      isLoading: false,
      hasRole: () => true,
    });
    renderWikiRoutes('/guide/wiki/admin');
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('wiki.showingEnglishFallback');
    });
    expect(screen.getByText('Admin Guide')).toBeInTheDocument();
    expect(screen.getByText('Content here.')).toBeInTheDocument();
    expect(screen.queryByText('SPA')).not.toBeInTheDocument();
    expect(screen.queryByText(/<!doctype/i)).not.toBeInTheDocument();
  });

  it('shows error when both German and English fetch return HTML', async () => {
    mockUseTranslation.mockReturnValue({
      t: (key: string) => key,
      i18n: { language: 'de' },
    });
    const adminIndex = [
      { slug: 'admin', titleKey: 'wiki.articles.adminGuide', file: 'admin.md', adminOnly: true },
    ];
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    const htmlBody = '<!doctype html><html><body>SPA</body></html>';
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(adminIndex) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(adminIndex) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(adminIndex) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(htmlBody) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(htmlBody) });
    mockUseAuth.mockReturnValue({
      isAdminOrModerator: true,
      isAuthenticated: true,
      isLoading: false,
      hasRole: () => true,
    });
    renderWikiRoutes('/guide/wiki/admin');
    await waitFor(() => {
      expect(screen.getByText(/common\.error|Article not found/)).toBeInTheDocument();
    });
    expect(screen.queryByText('SPA')).not.toBeInTheDocument();
  });

  it('leaves staff-only articles out of previous and next for other readers', async () => {
    mockUseAuth.mockReturnValue({
      isAdminOrModerator: false,
      isAuthenticated: false,
      isLoading: false,
      hasRole: () => false,
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url === '/wiki/index.json') {
        return {
          ok: true,
          json: async () => [
            { slug: 'first', titleKey: 'wiki.articles.first', file: 'first.md' },
            { slug: 'staff', titleKey: 'wiki.articles.staff', file: 'staff.md', adminOnly: true },
            { slug: 'second', titleKey: 'wiki.articles.second', file: 'second.md' },
          ],
        };
      }
      return { ok: true, status: 200, text: async () => '# Article body' };
    });
    renderWikiRoutes('/guide/wiki/first');

    await screen.findByText('Article body');
    const articleNav = screen.getByRole('navigation', { name: 'wiki.articleNavLabel' });
    expect(articleNav.querySelector('a')).toHaveAttribute('href', '/guide/wiki/second');
  });
});
