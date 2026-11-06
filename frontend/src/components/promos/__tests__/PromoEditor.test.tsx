import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetAllPlayers, mockGetAllPromos, mockGetAllMatches, mockGetAllChampionships, mockCreatePromo, mockCreateChallenge, mockGetAllStipulations, mockGetAllMatchTypes, mockGetAllTagTeams, mockIsHiddenPlayer } =
  vi.hoisted(() => ({
    mockGetAllPlayers: vi.fn(),
    mockGetAllPromos: vi.fn(),
    mockGetAllMatches: vi.fn(),
    mockGetAllChampionships: vi.fn(),
    mockCreatePromo: vi.fn(),
    mockCreateChallenge: vi.fn(),
    mockGetAllStipulations: vi.fn(),
    mockGetAllMatchTypes: vi.fn(),
    mockGetAllTagTeams: vi.fn(),
    mockIsHiddenPlayer: vi.fn(),
  }));

vi.mock('../../../services/api', () => ({
  playersApi: { getAll: mockGetAllPlayers },
  promosApi: { getAll: mockGetAllPromos, create: mockCreatePromo },
  challengesApi: { create: mockCreateChallenge },
  matchesApi: { getAll: mockGetAllMatches },
  championshipsApi: { getAll: mockGetAllChampionships },
  stipulationsApi: { getAll: mockGetAllStipulations },
  matchTypesApi: { getAll: mockGetAllMatchTypes },
  tagTeamsApi: { getAll: mockGetAllTagTeams },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const t: Record<string, string> = {
        'promos.editor.title': 'Cut a Promo',
        'promos.editor.subtitle': 'Grab the mic and let the WWE Universe hear your voice.',
        'promos.editor.promoType': 'Promo Type',
        'promos.editor.promoTitle': 'Title',
        'promos.editor.optional': 'optional',
        'promos.editor.content': 'Content',
        'promos.editor.contentPlaceholder': 'Drop your promo here...',
        'promos.editor.titlePlaceholder': 'Give your promo a catchy title...',
        'promos.editor.targetPlayer': 'Target Wrestler',
        'promos.editor.selectPlayer': '-- Select a wrestler --',
        'promos.editor.showPreview': 'Show Preview',
        'promos.editor.hidePreview': 'Hide Preview',
        'promos.editor.preview': 'Preview',
        'promos.editor.submit': 'Drop the Mic',
        'promos.editor.successTitle': 'Promo Submitted!',
        'promos.editor.successMessage': 'Your promo has been published to the feed.',
        'promos.editor.viewFeed': 'View Promo Feed',
        'promos.editor.cutAnother': 'Cut Another Promo',
        'promos.editor.previewPlaceholder': 'Your promo content will appear here...',
        'promos.types.open-mic': 'Open Mic',
        'promos.types.call-out': 'Call-Out',
        'promos.types.response': 'Response',
        'promos.types.pre-match': 'Pre-Match',
        'promos.types.post-match': 'Post-Match',
        'promos.types.championship': 'Championship',
        'promos.types.return': 'Return',
        'promos.editor.typeDesc.open-mic': 'Speak your mind on any topic.',
        'promos.editor.typeDesc.call-out': 'Challenge another wrestler directly.',
        'promos.editor.typeDesc.response': 'Respond to another wrestler.',
        'promos.editor.typeDesc.pre-match': 'Hype up an upcoming match.',
        'promos.editor.typeDesc.post-match': 'React to a completed match.',
        'promos.editor.typeDesc.championship': 'Address a championship situation.',
        'promos.editor.typeDesc.return': 'Announce your return.',
        'promos.thread.backToFeed': 'Back to Promos',
        'promos.card.pinned': 'Pinned',
        'promos.card.response': 'response',
        'promos.card.responses': 'responses',
        'promos.card.viewThread': 'View Thread',
        'promos.reactions.fire': 'Fire',
        'promos.reactions.mic': 'Mic Drop',
        'promos.reactions.trash': 'Trash',
        'promos.reactions.mind-blown': 'Mind Blown',
        'promos.reactions.clap': 'Clap',
        'common.cancel': 'Cancel',
      };
      if (key === 'promos.editor.minChars') {
        const min = opts?.min ?? (typeof fallbackOrOpts === 'object' ? fallbackOrOpts.min : 50);
        return `Minimum ${min} characters`;
      }
      if (typeof fallbackOrOpts === 'string' && !t[key]) return fallbackOrOpts;
      return t[key] || key;
    },
  }),
}));

vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({
    features: { challenges: true, promos: true },
    isLoading: false,
    refreshConfig: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useIsHiddenPlayer', () => ({
  useIsHiddenPlayer: mockIsHiddenPlayer,
}));

vi.mock('../PromoEditor.css', () => ({}));
vi.mock('../PromoCard.css', () => ({}));
vi.mock('../PromoReactions.css', () => ({}));

import PromoEditor from '../PromoEditor';

function renderEditor(initialEntry = '/promos/new') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PromoEditor />
    </MemoryRouter>
  );
}

describe('PromoEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsHiddenPlayer.mockReturnValue(false);
    mockGetAllPlayers.mockResolvedValue([
      { playerId: 'p-1', userId: 'u-1', name: 'John', currentWrestler: 'Stone Cold', wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '' },
      { playerId: 'p-2', userId: 'u-2', name: 'Jane', currentWrestler: 'The Rock', wins: 0, losses: 0, draws: 0, createdAt: '', updatedAt: '' },
    ]);
    mockGetAllPromos.mockResolvedValue([]);
    mockGetAllMatches.mockResolvedValue([]);
    mockGetAllChampionships.mockResolvedValue([]);
    mockGetAllStipulations.mockResolvedValue([
      { stipulationId: 'stip-1', name: 'Steel Cage', createdAt: '', updatedAt: '' },
      { stipulationId: 'stip-2', name: 'Ladder', createdAt: '', updatedAt: '' },
    ]);
    mockGetAllMatchTypes.mockResolvedValue([
      { matchTypeId: 'mt-1', name: 'Singles', createdAt: '', updatedAt: '' },
      { matchTypeId: 'mt-2', name: 'Tag Team', createdAt: '', updatedAt: '' },
    ]);
    mockGetAllTagTeams.mockResolvedValue([]);
    // Mock sessionStorage for current player detection
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  });

  it('renders the form with promo type grid and content textarea', async () => {
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('Cut a Promo')).toBeInTheDocument();
    });

    // Promo type buttons
    expect(screen.getByText('Open Mic')).toBeInTheDocument();
    expect(screen.getByText('Call-Out')).toBeInTheDocument();
    expect(screen.getByText('Response')).toBeInTheDocument();
    expect(screen.getByText('Pre-Match')).toBeInTheDocument();
    expect(screen.getByText('Championship')).toBeInTheDocument();
    expect(screen.getByText('Return')).toBeInTheDocument();

    // Content area
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Drop the Mic')).toBeInTheDocument();
  });

  it('tells a player with no wrestler name why they cannot post, and blocks the submit', async () => {
    mockIsHiddenPlayer.mockReturnValue(true);
    const user = userEvent.setup();
    renderEditor();

    expect(await screen.findByText('me.setup.cannotCutPromoTitle')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'me.setup.enterName' })).toHaveAttribute('href', '/profile');

    await user.type(screen.getByPlaceholderText('Drop your promo here...'), 'x'.repeat(60));
    expect(screen.getByRole('button', { name: 'Drop the Mic' })).toBeDisabled();
  });

  it('validates content minimum length and disables submit when too short', async () => {
    const user = userEvent.setup();
    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('Cut a Promo')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText('Drop your promo here...');
    await user.type(textarea, 'Short');

    // Should show minimum characters warning
    expect(screen.getByText('Minimum 50 characters')).toBeInTheDocument();

    // Submit button should be disabled
    const submitBtn = screen.getByText('Drop the Mic');
    expect(submitBtn).toBeDisabled();
  });

  it('creates a promo with valid content and shows success', async () => {
    const user = userEvent.setup();
    mockCreatePromo.mockResolvedValue({});

    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('Cut a Promo')).toBeInTheDocument();
    });

    // Type sufficient content (50+ chars)
    const textarea = screen.getByPlaceholderText('Drop your promo here...');
    const validContent = 'A'.repeat(60);
    await user.click(textarea);
    await user.paste(validContent);

    // Submit
    const submitBtn = screen.getByText('Drop the Mic');
    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreatePromo).toHaveBeenCalledWith(
        expect.objectContaining({
          promoType: 'open-mic',
          content: validContent,
        })
      );
    });

    // Success screen
    await waitFor(() => {
      expect(screen.getByText('Promo Submitted!')).toBeInTheDocument();
      expect(screen.getByText('View Promo Feed')).toBeInTheDocument();
      expect(screen.getByText('Cut Another Promo')).toBeInTheDocument();
    });
  });

  it('issues a challenge when a call-out is published', async () => {
    const user = userEvent.setup();
    mockCreatePromo.mockResolvedValue({ promoId: 'promo-1' });
    mockCreateChallenge.mockResolvedValue({});
    mockGetAllMatchTypes.mockResolvedValue([{ matchTypeId: 'mt-1', name: 'Singles' }]);

    const { container } = renderEditor('/promos/new?promoType=call-out&targetPlayerId=p-2');

    const textarea = await screen.findByPlaceholderText('Drop your promo here...');
    await user.click(textarea);
    await user.paste('A'.repeat(60));

    // A call-out cannot go out without the match type the challenge needs.
    const submitBtn = screen.getByText('Drop the Mic');
    expect(submitBtn).toBeDisabled();

    await waitFor(() => {
      expect(container.querySelector('select option[value="Singles"]')).not.toBeNull();
    });
    const matchTypeSelect = container.querySelector('select option[value="Singles"]')?.parentElement as HTMLSelectElement;
    fireEvent.change(matchTypeSelect, { target: { value: 'Singles' } });

    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateChallenge).toHaveBeenCalledWith(
        expect.objectContaining({ challengedId: 'p-2', matchType: 'Singles', promoId: 'promo-1' })
      );
    });
  });

  describe('title challenges', () => {
    const worldTitle = { championshipId: 'world', name: 'World Title', type: 'singles', currentChampion: 'p-2', isActive: true, createdAt: '' };
    const tagTitle = { championshipId: 'tag-belts', name: 'Tag Titles', type: 'tag', currentChampion: ['p-3', 'p-4'], isActive: true, createdAt: '' };

    function pickOption(container: HTMLElement, value: string) {
      const select = container.querySelector(`select option[value="${value}"]`)?.parentElement as HTMLSelectElement;
      fireEvent.change(select, { target: { value } });
    }

    async function writePromo(user: ReturnType<typeof userEvent.setup>) {
      const textarea = await screen.findByPlaceholderText('Drop your promo here...');
      await user.click(textarea);
      await user.paste('A'.repeat(60));
    }

    it('puts the chosen title on a singles call-out', async () => {
      const user = userEvent.setup();
      mockCreatePromo.mockResolvedValue({});
      mockCreateChallenge.mockResolvedValue({});
      mockGetAllChampionships.mockResolvedValue([worldTitle, tagTitle]);

      const { container } = renderEditor('/promos/new?promoType=call-out&targetPlayerId=p-2');
      await writePromo(user);
      await waitFor(() => expect(container.querySelector('select option[value="Singles"]')).not.toBeNull());
      pickOption(container, 'Singles');

      await waitFor(() => expect(container.querySelector('select option[value="world"]')).not.toBeNull());
      expect(container.querySelector('select option[value="tag-belts"]')).toBeNull();
      pickOption(container, 'world');

      await user.click(screen.getByText('Drop the Mic'));

      await waitFor(() => {
        expect(mockCreateChallenge).toHaveBeenCalledWith(
          expect.objectContaining({ challengedId: 'p-2', matchType: 'Singles', championshipId: 'world' }),
        );
      });
      expect(mockCreatePromo).toHaveBeenCalledWith(expect.objectContaining({ championshipId: 'world' }));
    });

    it('drops a title the new match type rules out', async () => {
      const user = userEvent.setup();
      mockCreatePromo.mockResolvedValue({});
      mockCreateChallenge.mockResolvedValue({});
      mockGetAllChampionships.mockResolvedValue([worldTitle]);

      const { container } = renderEditor('/promos/new?promoType=call-out&targetPlayerId=p-2');
      await writePromo(user);
      await waitFor(() => expect(container.querySelector('select option[value="Singles"]')).not.toBeNull());
      pickOption(container, 'Singles');
      await waitFor(() => expect(container.querySelector('select option[value="world"]')).not.toBeNull());
      pickOption(container, 'world');

      pickOption(container, 'Tag Team');
      await waitFor(() => expect(container.querySelector('select option[value="world"]')).toBeNull());

      await user.click(screen.getByText('Drop the Mic'));

      await waitFor(() => expect(mockCreateChallenge).toHaveBeenCalled());
      expect(mockCreateChallenge.mock.calls[0]?.[0].championshipId).toBeUndefined();
    });

    it('puts a tag title on a tag team call-out', async () => {
      const user = userEvent.setup();
      mockCreatePromo.mockResolvedValue({});
      mockCreateChallenge.mockResolvedValue({});
      mockGetAllChampionships.mockResolvedValue([worldTitle, tagTitle]);
      mockGetAllTagTeams.mockResolvedValue([
        { tagTeamId: 'team-1', name: 'Us', player1Id: 'p-1', player2Id: 'p-5', status: 'active' },
        { tagTeamId: 'team-2', name: 'Them', player1Id: 'p-3', player2Id: 'p-4', status: 'active' },
      ]);

      const { container } = renderEditor('/promos/new?promoType=call-out');
      await writePromo(user);
      await user.click(await screen.findByRole('radio', { name: 'Tag Team' }));
      pickOption(container, 'team-2');
      pickOption(container, 'Tag Team');

      await waitFor(() => expect(container.querySelector('select option[value="tag-belts"]')).not.toBeNull());
      expect(container.querySelector('select option[value="world"]')).toBeNull();
      pickOption(container, 'tag-belts');

      await user.click(screen.getByText('Drop the Mic'));

      await waitFor(() => {
        expect(mockCreateChallenge).toHaveBeenCalledWith(expect.objectContaining({
          challengeMode: 'tag_team', challengedTagTeamId: 'team-2', matchType: 'Tag Team', championshipId: 'tag-belts',
        }));
      });
    });
  });
});
