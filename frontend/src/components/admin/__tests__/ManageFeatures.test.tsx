import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockSiteConfigApi, mockUseSiteConfig, DEFAULT_TICKER } = vi.hoisted(() => ({
  mockSiteConfigApi: {
    updateFeatures: vi.fn(),
    updateTickerSettings: vi.fn(),
  },
  mockUseSiteConfig: vi.fn(),
  DEFAULT_TICKER: {
    enabledSegments: [
      'pinned', 'tonight', 'newChampions', 'potentialCallups', 'promotionWatch', 'hotRivalries',
      'custom', 'news', 'upcomingShows', 'champions', 'latestResults',
    ],
    scrollSpeed: 'normal',
    publicRelegationWatch: false,
  },
}));

vi.mock('../../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/siteConfig.api')>('../../../services/api/siteConfig.api');
  return {
    TICKER_SEGMENT_KEYS: actual.TICKER_SEGMENT_KEYS,
    TICKER_SCROLL_SPEEDS: actual.TICKER_SCROLL_SPEEDS,
    siteConfigApi: mockSiteConfigApi,
  };
});

// Tests set features and refreshConfig; ticker settings default unless a test overrides them.
vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({ tickerSettings: DEFAULT_TICKER, ...mockUseSiteConfig() }),
}));


import ManageFeatures from '../ManageFeatures';

const ALL_FEATURES = {
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
};

describe('ManageFeatures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSiteConfig.mockReturnValue({
      features: ALL_FEATURES,
      refreshConfig: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renders all feature toggles with correct enabled/disabled state', () => {
    mockUseSiteConfig.mockReturnValue({
      features: { ...ALL_FEATURES, promos: false },
      refreshConfig: vi.fn(),
    });

    render(<ManageFeatures />);

    expect(screen.getByText('Feature Management')).toBeInTheDocument();
    expect(screen.getByText('Challenges')).toBeInTheDocument();
    expect(screen.getByText('Promos')).toBeInTheDocument();
    expect(screen.getByText('Contender Rankings')).toBeInTheDocument();
    expect(screen.getByText('Statistics')).toBeInTheDocument();

    // Promos is disabled, rest are enabled
    expect(screen.getByLabelText('Enable Promos')).toHaveTextContent('Disabled');
    expect(screen.getByLabelText('Disable Challenges')).toHaveTextContent('Enabled');
  });

  it('lets an Admin turn division transfers back on', async () => {
    mockUseSiteConfig.mockReturnValue({
      features: { ...ALL_FEATURES, transfers: false },
      refreshConfig: vi.fn().mockResolvedValue(undefined),
    });
    mockSiteConfigApi.updateFeatures.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<ManageFeatures />);

    await user.click(screen.getByLabelText('Enable Division Transfers'));

    await waitFor(() => {
      expect(mockSiteConfigApi.updateFeatures).toHaveBeenCalledWith({ transfers: true });
    });
  });

  it('toggles a feature flag and calls API then refreshes config', async () => {
    const mockRefresh = vi.fn().mockResolvedValue(undefined);
    mockUseSiteConfig.mockReturnValue({
      features: ALL_FEATURES,
      refreshConfig: mockRefresh,
    });
    mockSiteConfigApi.updateFeatures.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<ManageFeatures />);

    // Click to disable challenges (currently enabled)
    await user.click(screen.getByLabelText('Disable Challenges'));

    await waitFor(() => {
      expect(mockSiteConfigApi.updateFeatures).toHaveBeenCalledWith({ challenges: false });
    });
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('shows error message when API call fails', async () => {
    mockSiteConfigApi.updateFeatures.mockRejectedValue(new Error('Network failure'));

    const user = userEvent.setup();
    render(<ManageFeatures />);

    await user.click(screen.getByLabelText('Disable Challenges'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network failure');
    });

    // Dismiss button clears error
    await user.click(screen.getByText('Dismiss'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists the ticker flag with the other features', () => {
    mockUseSiteConfig.mockReturnValue({ features: { ...ALL_FEATURES, ticker: false }, refreshConfig: vi.fn() });

    render(<ManageFeatures />);

    expect(screen.getByText('League Ticker')).toBeInTheDocument();
    expect(screen.getByLabelText('Enable League Ticker')).toHaveTextContent('Disabled');
  });

  it('saves ticker segments, speed and relegation visibility', async () => {
    const mockRefresh = vi.fn().mockResolvedValue(undefined);
    mockUseSiteConfig.mockReturnValue({ features: ALL_FEATURES, refreshConfig: mockRefresh });
    mockSiteConfigApi.updateTickerSettings.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<ManageFeatures />);

    expect(screen.getByRole('checkbox', { name: 'News' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'News' }));
    await user.click(screen.getByRole('checkbox', { name: 'Pinned GM messages' }));
    await user.click(screen.getByRole('radio', { name: 'Fast' }));
    await user.click(screen.getByRole('checkbox', { name: 'Show relegation watch to everyone' }));
    await user.click(screen.getByRole('button', { name: 'Save Ticker Settings' }));

    await waitFor(() => {
      expect(mockSiteConfigApi.updateTickerSettings).toHaveBeenCalledWith({
        enabledSegments: DEFAULT_TICKER.enabledSegments.filter((key) => key !== 'news' && key !== 'pinned'),
        scrollSpeed: 'fast',
        publicRelegationWatch: true,
      });
    });
    expect(mockRefresh).toHaveBeenCalled();
    expect(await screen.findByText('Ticker settings saved.')).toBeInTheDocument();
  });

  it('shows the error when ticker settings fail to save', async () => {
    mockSiteConfigApi.updateTickerSettings.mockRejectedValue(new Error('Bad speed'));

    const user = userEvent.setup();
    render(<ManageFeatures />);

    await user.click(screen.getByRole('button', { name: 'Save Ticker Settings' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Bad speed');
    });
  });
});
