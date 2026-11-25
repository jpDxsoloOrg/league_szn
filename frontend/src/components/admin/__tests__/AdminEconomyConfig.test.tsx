import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EconomySettings } from '../../../services/api/economy.api';

const { mockEconomyApi, mockUseAuth, mockUseSiteConfig } = vi.hoisted(() => ({
  mockEconomyApi: { getConfig: vi.fn(), updateConfig: vi.fn() },
  mockUseAuth: vi.fn(),
  mockUseSiteConfig: vi.fn(),
}));

vi.mock('../../../services/api/economy.api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/economy.api')>('../../../services/api/economy.api');
  return { ...actual, economyApi: mockEconomyApi };
});
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../../../contexts/SiteConfigContext', () => ({ useSiteConfig: mockUseSiteConfig }));

import AdminEconomyConfig from '../AdminEconomyConfig';
import { ApiError } from '../../../services/api/apiClient';

function makeSettings(overrides: Partial<EconomySettings> = {}): EconomySettings {
  return {
    currencyName: 'League Dollars',
    currencySymbol: '$',
    contractDefaults: {
      tryout: { matches: 3, perMatchPay: 100, weeklySalary: 0, winBonus: 50 },
      matches: { perMatchPay: 150, weeklySalary: 0, winBonus: 75 },
      season: { perMatchPay: 100, weeklySalary: 250, winBonus: 100 },
    },
    freeAgentWinBonus: 50,
    offerExpiryDays: 3,
    noShowFine: 250,
    finePresets: [{ key: 'pause-abuse', label: 'Pause abuse', amount: 100 }],
    shop: {
      injuryShield: { enabled: true, price: 300, chanceReduction: 0.5, matches: 3 },
      rehab: { enabled: true, price: 500, weeksOff: 1 },
      staminaTopUp: { enabled: true, price: 150, amount: 20 },
      simInterference: { enabled: true, price: 250, ratingBoost: 5 },
      gmInterference: { enabled: true, price: 1000 },
    },
    version: 2,
    updatedAt: '2026-11-20T10:00:00.000Z',
    updatedBy: 'gm',
    ...overrides,
  };
}

describe('AdminEconomyConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isSuperAdmin: true });
    mockUseSiteConfig.mockReturnValue({ features: { economy: true } });
    mockEconomyApi.getConfig.mockResolvedValue({ settings: makeSettings() });
  });

  it('shows the saved settings with the shield reduction as a percentage', async () => {
    render(<AdminEconomyConfig />);

    expect(await screen.findByLabelText('Currency name')).toHaveValue('League Dollars');
    expect(screen.getByLabelText('Tryout length (matches)')).toHaveValue(3);
    expect(screen.getByLabelText('Injury chance cut (%)')).toHaveValue(50);
    expect(screen.getByLabelText('Weeks taken off the injury')).toHaveValue(1);
    expect(screen.getByLabelText('Label')).toHaveValue('Pause abuse');
  });

  it('saves the whole form with the loaded version', async () => {
    const user = userEvent.setup();
    mockEconomyApi.updateConfig.mockResolvedValue({ settings: makeSettings({ noShowFine: 400, version: 3 }) });
    render(<AdminEconomyConfig />);

    const noShow = await screen.findByLabelText('No-show fine');
    await user.clear(noShow);
    await user.type(noShow, '400');
    const shield = screen.getByLabelText('Injury chance cut (%)');
    await user.clear(shield);
    await user.type(shield, '25');
    await user.click(screen.getByRole('button', { name: 'Add fine preset' }));
    const labels = screen.getAllByLabelText('Label');
    await user.type(labels[labels.length - 1], 'Rope-break abuse');
    await user.click(screen.getByRole('button', { name: 'Save Economy Settings' }));

    await waitFor(() => expect(mockEconomyApi.updateConfig).toHaveBeenCalledTimes(1));
    const [settings, expectedVersion] = mockEconomyApi.updateConfig.mock.calls[0];
    expect(expectedVersion).toBe(2);
    expect(settings.noShowFine).toBe(400);
    expect(settings.shop.injuryShield.chanceReduction).toBe(0.25);
    expect(settings.finePresets).toEqual([
      { key: 'pause-abuse', label: 'Pause abuse', amount: 100 },
      { key: 'rope-break-abuse', label: 'Rope-break abuse', amount: 0 },
    ]);
    expect(settings).not.toHaveProperty('version');
    expect(await screen.findByText('Economy settings saved.')).toBeInTheDocument();
  });

  it('does not save while an amount is empty', async () => {
    const user = userEvent.setup();
    render(<AdminEconomyConfig />);

    await user.clear(await screen.findByLabelText('No-show fine'));
    await user.click(screen.getByRole('button', { name: 'Save Economy Settings' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/whole number of 0 or more/);
    expect(mockEconomyApi.updateConfig).not.toHaveBeenCalled();
  });

  it('removes a fine preset', async () => {
    const user = userEvent.setup();
    mockEconomyApi.updateConfig.mockResolvedValue({ settings: makeSettings({ finePresets: [], version: 3 }) });
    render(<AdminEconomyConfig />);

    await user.click(await screen.findByRole('button', { name: 'Remove fine preset {{number}}' }));
    expect(screen.getByText('No fine presets yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Economy Settings' }));

    await waitFor(() => expect(mockEconomyApi.updateConfig).toHaveBeenCalled());
    expect(mockEconomyApi.updateConfig.mock.calls[0][0].finePresets).toEqual([]);
  });

  it('offers a reload when someone else saved first', async () => {
    const user = userEvent.setup();
    mockEconomyApi.updateConfig.mockRejectedValue(new ApiError('Economy settings changed', 409));
    render(<AdminEconomyConfig />);

    await user.click(await screen.findByRole('button', { name: 'Save Economy Settings' }));
    expect(await screen.findByText(/Someone else saved these settings/)).toBeInTheDocument();

    mockEconomyApi.getConfig.mockResolvedValue({ settings: makeSettings({ currencyName: 'Bucks', version: 3 }) });
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(await screen.findByLabelText('Currency name')).toHaveValue('Bucks');
  });

  it('works out a season contract budget from the current terms', async () => {
    const user = userEvent.setup();
    render(<AdminEconomyConfig />);

    const budget = await screen.findByTestId('economy-budget');
    // 10 weeks x 250 + 10 matches x 100 + 5 wins x 100
    expect(within(budget).getByText('$4,000')).toBeInTheDocument();

    const salary = screen.getByLabelText('Weekly salary', { selector: '#economy-season-weeklySalary' });
    await user.clear(salary);
    await user.type(salary, '0');
    // Clearing the box removes the summary, so look it up again.
    expect(within(screen.getByTestId('economy-budget')).getByText('$1,500')).toBeInTheDocument();
  });

  it('is read-only for Moderators', async () => {
    mockUseAuth.mockReturnValue({ isSuperAdmin: false });
    render(<AdminEconomyConfig />);

    expect(await screen.findByLabelText('Currency name')).toBeDisabled();
    expect(screen.getByLabelText('No-show fine')).toBeDisabled();
    expect(screen.getByText('You can view these settings. Only Admins can change them.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Economy Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add fine preset' })).not.toBeInTheDocument();
    // The budget check is not a setting, so Moderators can still use it.
    expect(screen.getByLabelText('Weeks')).toBeEnabled();
  });

  it('says when the economy feature is off', async () => {
    mockUseSiteConfig.mockReturnValue({ features: { economy: false } });
    render(<AdminEconomyConfig />);

    expect(await screen.findByText(/The economy is turned off/)).toBeInTheDocument();
  });

  it('shows a retry when the settings fail to load', async () => {
    const user = userEvent.setup();
    mockEconomyApi.getConfig.mockRejectedValueOnce(new Error('boom'));
    render(<AdminEconomyConfig />);

    expect(await screen.findByText('Could not load the economy settings.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Currency name')).toHaveValue('League Dollars');
  });
});
