import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Hoisted mocks ---
const { mockSiteConfigApi, mockUseSiteConfig } = vi.hoisted(() => ({
  mockSiteConfigApi: {
    updateFeatures: vi.fn(),
  },
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  siteConfigApi: mockSiteConfigApi,
}));

vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: mockUseSiteConfig,
}));

vi.mock('../ManageFeatures.css', () => ({}));

import ManageFeatures from '../ManageFeatures';

const ALL_FEATURES = {
  fantasy: true,
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
    expect(screen.getByText('Fantasy League')).toBeInTheDocument();
    expect(screen.getByText('Challenges')).toBeInTheDocument();
    expect(screen.getByText('Promos')).toBeInTheDocument();
    expect(screen.getByText('Contender Rankings')).toBeInTheDocument();
    expect(screen.getByText('Statistics')).toBeInTheDocument();

    // Promos is disabled, rest are enabled
    expect(screen.getByLabelText('Enable Promos')).toHaveTextContent('Disabled');
    expect(screen.getByLabelText('Disable Fantasy League')).toHaveTextContent('Enabled');
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

    await user.click(screen.getByLabelText('Disable Fantasy League'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network failure');
    });

    // Dismiss button clears error
    await user.click(screen.getByText('Dismiss'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
