import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const {
  mockGetPromos,
  mockUseOutletContext,
} = vi.hoisted(() => ({
  mockGetPromos: vi.fn(),
  mockUseOutletContext: vi.fn(),
}));

vi.mock('../../../../services/api', () => ({
  factionsApi: { getPromos: mockGetPromos },
}));

vi.mock('react-router-dom', async () => {
  const actual: typeof import('react-router-dom') = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useOutletContext: () => mockUseOutletContext(),
  };
});

const interpolatingT = (_key: string, fallback?: string, options?: Record<string, unknown>) => {
  let text = fallback ?? _key;
  if (options) {
    for (const [name, value] of Object.entries(options)) {
      text = text.replace(new RegExp(`{{\\s*${name}\\s*}}`, 'g'), String(value));
    }
  }
  return text;
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: interpolatingT }),
}));

vi.mock('../FactionPromos.css', () => ({}));

import FactionPromos from '../FactionPromos';

const baseFaction = () => ({
  stableId: 'f1',
  name: 'The Brood',
  leaderId: 'leader',
  leaderName: 'Edge',
  memberIds: ['leader'],
  status: 'active',
  wins: 0,
  losses: 0,
  draws: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  members: [],
  standings: { winPercentage: 0, recentForm: [], currentStreak: { type: 'W', count: 0 } },
  headToHead: [],
  matchTypeRecords: [],
  recentMatches: [],
});

const basePromo = (overrides: Record<string, unknown> = {}) => ({
  promoId: 'p1',
  promoType: 'open-mic' as const,
  thumbnail: null,
  headline: 'Promo headline',
  excerpt: 'body',
  authorPlayerId: 'author-1',
  authorPlayerName: 'Author',
  authorWrestlerName: 'AuthorWrestler',
  targetPlayerId: null,
  targetPlayerName: null,
  targetWrestlerName: null,
  date: '2026-05-01T00:00:00.000Z',
  viewCount: null,
  heatImpact: null,
  isReplyable: true,
  ...overrides,
});

function renderTab() {
  return render(
    <MemoryRouter>
      <FactionPromos />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseOutletContext.mockReturnValue({ faction: baseFaction() });
  mockGetPromos.mockResolvedValue({ items: [basePromo()] });
});

describe('FactionPromos tab (FAC-14)', () => {
  it('refetches with the selected filter when a segmented control changes', async () => {
    renderTab();
    await waitFor(() => expect(mockGetPromos).toHaveBeenCalled());

    expect(mockGetPromos).toHaveBeenLastCalledWith(
      'f1',
      { filter: 'all', limit: 30 },
      expect.anything(),
    );

    await userEvent.click(screen.getByRole('tab', { name: 'BY THIS FACTION' }));

    await waitFor(() => {
      expect(mockGetPromos).toHaveBeenLastCalledWith(
        'f1',
        { filter: 'by-faction', limit: 30 },
        expect.anything(),
      );
    });
  });

  it('shows Most Viewed / Highest Heat sort options only when items carry those fields', async () => {
    // Default mock returns items with viewCount=null and heatImpact=null —
    // those sort options should stay hidden.
    renderTab();
    await screen.findByText('Promo headline');

    const sortSelect = screen.getByLabelText('Sort promos');
    expect(within(sortSelect).queryByText('Most Viewed')).not.toBeInTheDocument();
    expect(within(sortSelect).queryByText('Highest Heat')).not.toBeInTheDocument();
  });

  it('exposes view/heat sort options when items carry those fields', async () => {
    mockGetPromos.mockResolvedValueOnce({
      items: [
        basePromo({ promoId: 'p1', headline: 'First promo', viewCount: 100, heatImpact: 5, date: '2026-05-01T00:00:00.000Z' }),
        basePromo({ promoId: 'p2', headline: 'Second promo', viewCount: 300, heatImpact: -2, date: '2026-04-01T00:00:00.000Z' }),
      ],
    });

    renderTab();
    await screen.findByText('First promo');

    const sortSelect = screen.getByLabelText('Sort promos') as HTMLSelectElement;
    expect(within(sortSelect).getByText('Most Viewed')).toBeInTheDocument();

    // Switching to Most Viewed reorders p2 (300 views) before p1.
    await userEvent.selectOptions(sortSelect, 'viewed');

    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText(/👁/).textContent).toContain('300');
  });

  it('appends the next page when Load more is clicked', async () => {
    mockGetPromos.mockResolvedValueOnce({
      items: [basePromo({ promoId: 'first', headline: 'First promo' })],
      nextCursor: 'cursor-2',
    });
    mockGetPromos.mockResolvedValueOnce({
      items: [basePromo({ promoId: 'second', headline: 'Second promo' })],
    });

    renderTab();
    await screen.findByText('First promo');

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(mockGetPromos).toHaveBeenLastCalledWith('f1', {
        filter: 'all',
        limit: 30,
        cursor: 'cursor-2',
      });
    });
    expect(await screen.findByText('Second promo')).toBeInTheDocument();
    // The first card is still there too.
    expect(screen.getByText('First promo')).toBeInTheDocument();
  });

  it('renders the "Reply with a promo" CTA only in the directed-at-faction filter', async () => {
    // Default mock returns one promo. ALL filter — no CTA.
    renderTab();
    await screen.findByText('Promo headline');
    expect(screen.queryByRole('link', { name: 'Reply with a promo' })).not.toBeInTheDocument();

    // Switch to DIRECTED AT US — the same mock returns a promo and now the CTA shows.
    mockGetPromos.mockResolvedValueOnce({
      items: [
        basePromo({
          promoId: 'pd',
          targetPlayerId: 'leader',
          authorPlayerId: 'outsider',
          authorWrestlerName: 'Outsider',
        }),
      ],
    });
    await userEvent.click(screen.getByRole('tab', { name: 'DIRECTED AT US' }));

    const cta = await screen.findByRole('link', { name: 'Reply with a promo' });
    expect(cta).toHaveAttribute(
      'href',
      expect.stringContaining('targetPlayerId=outsider'),
    );
    expect(cta).toHaveAttribute(
      'href',
      expect.stringContaining('promoType=response'),
    );
  });
});
