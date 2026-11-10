import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { mockGetActive } = vi.hoisted(() => ({ mockGetActive: vi.fn() }));

vi.mock('../../../services/api', () => ({ announcementsApi: { getActive: mockGetActive } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import News from '../News';
import NewsArticle from '../NewsArticle';
import { excerpt, htmlToText } from '../../../utils/htmlText';

const OLDER = { announcementId: 'a1', title: 'Older story', body: '<p>Old <b>body</b></p>', isActive: true, priority: 1, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
const NEWER = { announcementId: 'a2', title: 'Newer story', body: '<p>New body</p><script>alert(1)</script>', isActive: true, priority: 3, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' };

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/news" element={<News />} />
        <Route path="/news/:newsId" element={<NewsArticle />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockGetActive.mockReset();
});

describe('News', () => {
  it('leads with the newest story and lists the rest', async () => {
    mockGetActive.mockResolvedValue([OLDER, NEWER]);
    renderAt('/news');

    const lead = await screen.findByRole('heading', { level: 2, name: 'Newer story' });
    expect(lead.closest('article')).toHaveTextContent('news.topStory');
    expect(lead.closest('article')).toHaveTextContent('news.breaking');
    expect(screen.getByRole('link', { name: 'Older story' })).toHaveAttribute('href', '/news/a1');
    expect(screen.getByText('Old body')).toBeInTheDocument();
  });

  it('says so when there is no news', async () => {
    mockGetActive.mockResolvedValue([]);
    renderAt('/news');
    expect(await screen.findByText('news.empty.title')).toBeInTheDocument();
  });

  it('reports a failed load', async () => {
    mockGetActive.mockRejectedValue(new Error('down'));
    renderAt('/news');
    expect(await screen.findByRole('alert')).toHaveTextContent('news.loadFailed');
  });
});

describe('NewsArticle', () => {
  it('shows the full story with unsafe markup removed', async () => {
    mockGetActive.mockResolvedValue([OLDER, NEWER]);
    const { container } = renderAt('/news/a2');

    expect(await screen.findByRole('heading', { level: 1, name: 'Newer story' })).toBeInTheDocument();
    expect(screen.getByText('New body')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByRole('link', { name: 'news.backToNews' })).toHaveAttribute('href', '/news');
  });

  it('explains a story that is gone', async () => {
    mockGetActive.mockResolvedValue([OLDER]);
    renderAt('/news/missing');
    expect(await screen.findByText('news.notFound.title')).toBeInTheDocument();
  });
});

describe('htmlText', () => {
  it('reads text out of markup and drops scripts', () => {
    expect(htmlToText('<p>One</p>\n<p>two <b>three</b></p><script>bad()</script>')).toBe('One two three');
    expect(htmlToText(undefined)).toBe('');
  });

  it('cuts long text at a word', () => {
    expect(excerpt('short', 20)).toBe('short');
    expect(excerpt('the quick brown fox jumps', 18)).toBe('the quick brown…');
  });
});
