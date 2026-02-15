import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

const { mockUseTranslation } = vi.hoisted(() => ({
  mockUseTranslation: vi.fn(() => ({ t: (key: string) => key })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => mockUseTranslation(),
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
        <Route path="/guide" element={<div>User Guide</div>} />
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

  it('WikiLayout shows back-to-guide link', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    renderWikiRoutes();
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

  it('back-to-guide link navigates to /guide', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    renderWikiRoutes();
    const backLink = await screen.findByRole('link', { name: 'wiki.backToGuide' });
    await userEvent.click(backLink);
    await waitFor(() => {
      expect(screen.getByText('User Guide')).toBeInTheDocument();
    });
  });
});
