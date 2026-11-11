import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import type { PromoWithContext } from '../../../types/promo';
import type { ChallengeWithPlayers } from '../../../types/challenge';

const { mockGetChallenges, mockRespond, mockUseAuth, mockUseSiteConfig } = vi.hoisted(() => ({
  mockGetChallenges: vi.fn(),
  mockRespond: vi.fn(),
  mockUseAuth: vi.fn(),
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  challengesApi: { getAll: mockGetChallenges, respond: mockRespond },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, fallback?: string) => {
      const t: Record<string, string> = {
        'promos.types.open-mic': 'Open Mic',
        'promos.types.call-out': 'Call-Out',
        'promos.types.response': 'Response',
        'promos.card.pinned': 'Pinned',
        'promos.card.callingOut': 'Calling out',
        'promos.card.respondingTo': 'Responding to',
        'promos.card.aPromo': 'a promo',
        'promos.card.by': 'by',
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

vi.mock('../PromoCard.css', () => ({}));
vi.mock('../PromoReactions.css', () => ({}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: mockUseSiteConfig,
}));

import PromoCard from '../PromoCard';

const defaultCounts = { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 } as const;

function makePromo(overrides: Partial<PromoWithContext> = {}): PromoWithContext {
  return {
    promoId: 'promo-1',
    playerId: 'p-1',
    promoType: 'open-mic',
    content: 'This is my epic promo speech!',
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

function renderCard(promo: PromoWithContext, onReact?: (promoId: string, reaction: import('../../../types/promo').ReactionType) => void) {
  return render(
    <BrowserRouter>
      <PromoCard promo={promo} onReact={onReact} />
    </BrowserRouter>
  );
}

describe('PromoCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: false, playerId: null });
    mockUseSiteConfig.mockReturnValue({ features: { challenges: false } });
  });

  it('displays promo content, wrestler name, player name, and type badge', () => {
    const promo = makePromo({
      title: 'The Best Promo',
      content: 'I am the greatest of all time!',
      wrestlerName: 'Stone Cold',
      playerName: 'John',
      promoType: 'open-mic',
    });

    renderCard(promo);

    expect(screen.getByText('Stone Cold')).toBeInTheDocument();
    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Open Mic')).toBeInTheDocument();
    expect(screen.getByText('The Best Promo')).toBeInTheDocument();
    expect(screen.getByText(/I am the greatest of all time!/)).toBeInTheDocument();
  });

  it('shows reaction buttons with counts', () => {
    const promo = makePromo({
      reactionCounts: { fire: 5, mic: 2, trash: 0, 'mind-blown': 1, clap: 3 },
    });

    renderCard(promo);

    // Reaction buttons should be rendered with correct counts
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByLabelText('Fire')).toBeInTheDocument();
    expect(screen.getByLabelText('Mic Drop')).toBeInTheDocument();
    expect(screen.getByLabelText('Clap')).toBeInTheDocument();
  });

  it('shows thread link when there are responses', () => {
    const promo = makePromo({ responseCount: 3 });

    renderCard(promo);

    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/responses/)).toBeInTheDocument();
    expect(screen.getByText(/View Thread/)).toBeInTheDocument();
  });

  describe('call-out challenge status', () => {
    const postedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    function makeChallenge(overrides: Partial<ChallengeWithPlayers> = {}): ChallengeWithPlayers {
      return {
        challengeId: 'ch-1',
        challengerId: 'p-1',
        challengedId: 'me',
        matchType: 'Singles',
        status: 'pending',
        expiresAt: new Date(Date.now() + 2 * 86400000).toISOString(),
        createdAt: postedAt,
        updatedAt: postedAt,
        challenger: { playerName: 'John', wrestlerName: 'Stone Cold' },
        challenged: { playerName: 'Me', wrestlerName: 'The Rock' },
        ...overrides,
      };
    }

    const callOut = () => makePromo({ promoType: 'call-out', targetPlayerId: 'me', createdAt: postedAt });

    beforeEach(() => {
      mockUseAuth.mockReturnValue({ isAuthenticated: true, playerId: 'me' });
      mockUseSiteConfig.mockReturnValue({ features: { challenges: true } });
    });

    it('offers accept for a pending challenge', async () => {
      mockGetChallenges.mockResolvedValue([makeChallenge()]);
      renderCard(callOut());
      expect(await screen.findByText('Accept Challenge')).toBeInTheDocument();
    });

    const signedInBlocked = () => mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      playerId: 'me',
      profile: {
        discipline: {
          status: 'signup-blocked',
          activeStrikeCount: 2,
          activeStrikes: [],
          cooldownEndsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
          signupBlockedUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
          deactivatedAt: null,
        },
      },
    });

    it('turns accept off for a player blocked from signing up, and shows the time left on the card', async () => {
      signedInBlocked();
      mockGetChallenges.mockResolvedValue([makeChallenge()]);
      renderCard(callOut());
      const accept = (await screen.findByText('Accept Challenge')).closest('button');
      expect(accept).toBeDisabled();
      expect(accept).not.toHaveAttribute('title');
      expect(screen.getByRole('timer')).toBeInTheDocument();
    });

    it('shows no suspension time once there is nothing left to accept', async () => {
      signedInBlocked();
      mockGetChallenges.mockResolvedValue([makeChallenge({ status: 'accepted' })]);
      renderCard(callOut());
      expect(await screen.findByText('Challenge Accepted!')).toBeInTheDocument();
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    });

    it('shows accepted only for an accepted challenge', async () => {
      mockGetChallenges.mockResolvedValue([makeChallenge({ status: 'accepted' })]);
      renderCard(callOut());
      expect(await screen.findByText('Challenge Accepted!')).toBeInTheDocument();
    });

    it.each(['declined', 'expired', 'cancelled', 'countered', 'scheduled'] as const)(
      'does not call a %s challenge accepted',
      async (status) => {
        mockGetChallenges.mockResolvedValue([makeChallenge({ status })]);
        renderCard(callOut());
        expect(await screen.findByText('View Challenge')).toBeInTheDocument();
        expect(screen.queryByText('Challenge Accepted!')).not.toBeInTheDocument();
        expect(screen.queryByText('Accept Challenge')).not.toBeInTheDocument();
      }
    );

    it('treats an overdue pending challenge as expired', async () => {
      mockGetChallenges.mockResolvedValue([
        makeChallenge({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      ]);
      renderCard(callOut());
      expect(await screen.findByText('challenges.status.expired')).toBeInTheDocument();
      expect(screen.queryByText('Accept Challenge')).not.toBeInTheDocument();
    });

    it('uses the challenge closest to the promo, not an older one', async () => {
      mockGetChallenges.mockResolvedValue([
        makeChallenge({ challengeId: 'old', status: 'accepted', createdAt: new Date(Date.now() - 30 * 86400000).toISOString() }),
        makeChallenge({ challengeId: 'this-one', status: 'pending' }),
      ]);
      renderCard(callOut());
      expect(await screen.findByText('Accept Challenge')).toBeInTheDocument();
      expect(screen.queryByText('Challenge Accepted!')).not.toBeInTheDocument();
    });

    it('accepts the matched challenge', async () => {
      const user = userEvent.setup();
      mockGetChallenges.mockResolvedValue([makeChallenge()]);
      mockRespond.mockResolvedValue({});
      renderCard(callOut());

      await user.click(await screen.findByText('Accept Challenge'));

      await waitFor(() => expect(mockRespond).toHaveBeenCalledWith('ch-1', 'accept'));
      expect(await screen.findByText('Challenge Accepted!')).toBeInTheDocument();
    });
  });
});
