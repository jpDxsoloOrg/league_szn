import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

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

vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('pre', { 'data-testid': 'syntax-highlighter' }, React.createElement('code', null, children)),
}));
vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({ oneDark: {} }));

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

  it('WikiLayout shows breadcrumbs and back-to-guide link', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    renderWikiRoutes();
    const nav = screen.getByRole('navigation', { name: 'wiki.breadcrumbNav' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'wiki.breadcrumb.help' })).toHaveAttribute('href', '/guide');
    expect(screen.getByText('wiki.breadcrumb.wiki')).toBeInTheDocument();
    const backLink = await screen.findByRole('link', { name: 'wiki.backToGuide' });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/guide');
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

  it('back-to-guide link navigates to /guide and redirects to wiki index', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    renderWikiRoutes();
    const backLink = await screen.findByRole('link', { name: 'wiki.backToGuide' });
    await userEvent.click(backLink);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'wiki.breadcrumb.help' })).toBeInTheDocument();
    });
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
});
