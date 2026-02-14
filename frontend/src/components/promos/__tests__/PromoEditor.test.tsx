import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetAllPlayers, mockGetAllPromos, mockGetAllMatches, mockGetAllChampionships, mockCreatePromo, mockGetAllStipulations } =
  vi.hoisted(() => ({
    mockGetAllPlayers: vi.fn(),
    mockGetAllPromos: vi.fn(),
    mockGetAllMatches: vi.fn(),
    mockGetAllChampionships: vi.fn(),
    mockCreatePromo: vi.fn(),
    mockGetAllStipulations: vi.fn(),
  }));

vi.mock('../../../services/api', () => ({
  playersApi: { getAll: mockGetAllPlayers },
  promosApi: { getAll: mockGetAllPromos, create: mockCreatePromo },
  matchesApi: { getAll: mockGetAllMatches },
  championshipsApi: { getAll: mockGetAllChampionships },
  stipulationsApi: { getAll: mockGetAllStipulations },
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

vi.mock('../PromoEditor.css', () => ({}));
vi.mock('../PromoCard.css', () => ({}));
vi.mock('../PromoReactions.css', () => ({}));

import PromoEditor from '../PromoEditor';

function renderEditor() {
  return render(
    <BrowserRouter>
      <PromoEditor />
    </BrowserRouter>
  );
}

describe('PromoEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    await user.type(textarea, validContent);

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
});
