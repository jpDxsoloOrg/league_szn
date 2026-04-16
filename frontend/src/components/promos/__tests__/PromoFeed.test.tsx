import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import type { PromoWithContext } from '../../../types/promo';

// --- Hoisted mocks ---
const { mockGetAllPromos, mockReact } = vi.hoisted(() => ({
  mockGetAllPromos: vi.fn(),
  mockReact: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  promosApi: {
    getAll: mockGetAllPromos,
    react: mockReact,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const t: Record<string, string> = {
        'promos.feed.title': 'Wrestler Promos',
        'promos.feed.cutPromo': 'Cut a Promo',
        'promos.feed.filterAll': 'All',
        'promos.feed.filterCallOuts': 'Call-Outs',
        'promos.feed.filterChampionship': 'Championship',
        'promos.feed.filterMatch': 'Pre/Post Match',
        'promos.feed.filterMentions': 'Mentions',
        'promos.feed.pinnedPromos': 'Pinned',
        'promos.feed.noPromos': 'No promos found. Be the first to cut a promo!',
        'promos.types.open-mic': 'Open Mic',
        'promos.types.call-out': 'Call-Out',
        'promos.card.pinned': 'Pinned',
        'promos.card.response': 'response',
        'promos.card.responses': 'responses',
        'promos.card.viewThread': 'View Thread',
        'promos.reactions.fire': 'Fire',
        'promos.reactions.mic': 'Mic Drop',
        'promos.reactions.trash': 'Trash',
        'promos.reactions.mind-blown': 'Mind Blown',
        'promos.reactions.clap': 'Clap',
      };
      return t[key] || (typeof fallback === 'string' ? fallback : key);
    },
  }),
}));

vi.mock('../PromoFeed.css', () => ({}));
vi.mock('../PromoCard.css', () => ({}));
vi.mock('../PromoReactions.css', () => ({}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, playerId: null }),
}));

vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({ features: { challenges: false } }),
}));

import PromoFeed from '../PromoFeed';

const defaultCounts = { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 } as const;

function makePromo(overrides: Partial<PromoWithContext> = {}): PromoWithContext {
  return {
    promoId: 'promo-1',
    playerId: 'p-1',
    promoType: 'open-mic',
    content: 'I am the best wrestler in this league!',
    reactions: {},
    reactionCounts: { ...defaultCounts },
    isPinned: false,
    isHidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    playerName: 'John',
    wrestlerName: 'Stone Cold',
    responseCount: 0,
    ...overrides,
  };
}

function renderFeed() {
  return render(
    <BrowserRouter>
      <PromoFeed />
    </BrowserRouter>
  );
}

describe('PromoFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders promo list with filter tabs after loading', async () => {
    const promos = [
      makePromo({ wrestlerName: 'Undertaker', playerName: 'Mark' }),
      makePromo({
        promoId: 'promo-2',
        promoType: 'call-out',
        content: 'I am calling you out!',
        wrestlerName: 'The Rock',
        playerName: 'Jane',
      }),
    ];
    mockGetAllPromos.mockResolvedValue(promos);

    renderFeed();

    await waitFor(() => {
      expect(screen.getByText('Wrestler Promos')).toBeInTheDocument();
    });

    // Filter tabs
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Call-Outs')).toBeInTheDocument();
    expect(screen.getByText('Championship')).toBeInTheDocument();
    expect(screen.getByText('Pre/Post Match')).toBeInTheDocument();
    expect(screen.getByText('Mentions')).toBeInTheDocument();
    // "Responses" tab has been removed
    expect(screen.queryByText('Responses')).not.toBeInTheDocument();

    // Feed fetched with excludeResponses and an AbortSignal
    expect(mockGetAllPromos).toHaveBeenCalledWith(
      { excludeResponses: true },
      expect.any(AbortSignal)
    );

    // Promo content rendered
    expect(screen.getByText('Undertaker')).toBeInTheDocument();
    expect(screen.getByText('The Rock')).toBeInTheDocument();
  });

  it('filters promos by type when tab is clicked', async () => {
    const user = userEvent.setup();
    const promos = [
      makePromo({ promoId: 'promo-1', promoType: 'open-mic', wrestlerName: 'Undertaker', playerName: 'Mark' }),
      makePromo({ promoId: 'promo-2', promoType: 'call-out', wrestlerName: 'The Rock', playerName: 'Jane' }),
    ];
    mockGetAllPromos.mockResolvedValue(promos);

    renderFeed();

    await waitFor(() => {
      expect(screen.getByText('Undertaker')).toBeInTheDocument();
    });

    // Click Call-Outs filter
    await user.click(screen.getByText('Call-Outs'));

    // Only call-out promos should be visible
    expect(screen.getByText('The Rock')).toBeInTheDocument();
    // Open mic should not appear
    expect(screen.queryByText('Undertaker')).not.toBeInTheDocument();
  });

  it('shows pinned section when pinned promos exist and All filter is active', async () => {
    const promos = [
      makePromo({
        promoId: 'promo-pinned',
        isPinned: true,
        content: 'Pinned announcement!',
        wrestlerName: 'Undertaker',
        playerName: 'Mark',
      }),
      makePromo({
        promoId: 'promo-regular',
        content: 'Regular promo',
        wrestlerName: 'Kane',
        playerName: 'Glen',
      }),
    ];
    mockGetAllPromos.mockResolvedValue(promos);

    renderFeed();

    await waitFor(() => {
      // "Pinned" appears as both section heading and card indicator
      const pinnedElements = screen.getAllByText('Pinned');
      expect(pinnedElements.length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/Pinned announcement!/)).toBeInTheDocument();
    expect(screen.getByText(/Regular promo/)).toBeInTheDocument();
  });

  it('handles empty state with cut a promo link', async () => {
    mockGetAllPromos.mockResolvedValue([]);

    renderFeed();

    await waitFor(() => {
      expect(screen.getByText('No promos found. Be the first to cut a promo!')).toBeInTheDocument();
    });

    // "Cut a Promo" link available
    const cutLinks = screen.getAllByText('Cut a Promo');
    expect(cutLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('does not render response promos in the feed (defensive filter)', async () => {
    const parent = makePromo({
      promoId: 'promo-parent',
      promoType: 'call-out',
      content: 'You are going down!',
      wrestlerName: 'Undertaker',
      playerName: 'Mark',
    });
    const response = makePromo({
      promoId: 'promo-response',
      promoType: 'response',
      targetPromoId: 'promo-parent',
      content: 'Bring it on!',
      wrestlerName: 'The Rock',
      playerName: 'Jane',
    });
    mockGetAllPromos.mockResolvedValue([parent, response]);

    renderFeed();

    await waitFor(() => {
      expect(screen.getByText('Wrestler Promos')).toBeInTheDocument();
    });

    // Parent promo's card is visible
    expect(screen.getByText('Undertaker')).toBeInTheDocument();
    // Response promo's card is filtered out client-side
    expect(screen.queryByText('The Rock')).not.toBeInTheDocument();
    expect(screen.queryByText('Bring it on!')).not.toBeInTheDocument();
  });
});
