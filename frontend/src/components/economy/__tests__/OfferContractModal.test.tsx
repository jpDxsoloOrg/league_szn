import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockContractsApi, mockEconomyApi, mockSeasonsApi } = vi.hoisted(() => ({
  mockContractsApi: { offer: vi.fn() },
  mockEconomyApi: { getConfig: vi.fn() },
  mockSeasonsApi: { getAll: vi.fn() },
}));

vi.mock('../../../services/api/contracts.api', () => ({ contractsApi: mockContractsApi }));
vi.mock('../../../services/api/economy.api', async () => {
  const actual = await vi.importActual<typeof import('../../../services/api/economy.api')>('../../../services/api/economy.api');
  return { ...actual, economyApi: mockEconomyApi };
});
vi.mock('../../../services/api/seasons.api', () => ({ seasonsApi: mockSeasonsApi }));

import i18n from '../../../i18n';
import { ApiError } from '../../../services/api/apiClient';
import OfferContractModal from '../OfferContractModal';

const settings = {
  currencyName: 'League Dollars',
  currencySymbol: '$',
  contractDefaults: {
    tryout: { matches: 3, perMatchPay: 100, weeklySalary: 0, winBonus: 50 },
    matches: { perMatchPay: 150, weeklySalary: 0, winBonus: 75 },
    season: { perMatchPay: 120, weeklySalary: 250, winBonus: 100 },
  },
  offerExpiryDays: 3,
};

const player = { playerId: 'p1', label: 'Cody Rhodes', hasLinkedAccount: true };

describe('OfferContractModal', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    mockEconomyApi.getConfig.mockResolvedValue({ settings });
    mockSeasonsApi.getAll.mockResolvedValue([
      { seasonId: 's3', name: 'Season 3', status: 'completed' },
      { seasonId: 's4', name: 'Season 4', status: 'active' },
    ]);
  });

  it('starts from the season defaults for the active season', async () => {
    render(<OfferContractModal open onClose={vi.fn()} player={player} onOffered={vi.fn()} />);

    expect(await screen.findByLabelText('Pay per match ($)')).toHaveValue(120);
    expect(screen.getByLabelText('Weekly salary ($)')).toHaveValue(250);
    expect(screen.getByLabelText('Win bonus ($)')).toHaveValue(100);
    expect(screen.getByText('Season 4')).toBeInTheDocument();
    expect(screen.getByText(/the offer expires on/)).toBeInTheDocument();
  });

  it('refills the terms from the defaults when the type changes', async () => {
    const user = userEvent.setup();
    render(<OfferContractModal open onClose={vi.fn()} player={player} onOffered={vi.fn()} />);

    await user.click(await screen.findByLabelText('Tryout'));

    expect(screen.getByLabelText('Length (matches)')).toHaveValue(3);
    expect(screen.getByLabelText('Pay per match ($)')).toHaveValue(100);
    expect(screen.getByLabelText('Weekly salary ($)')).toBeDisabled();
    expect(screen.getByLabelText('Weekly salary ($)')).toHaveValue(0);
  });

  it('sends the edited offer', async () => {
    const user = userEvent.setup();
    const onOffered = vi.fn();
    const contract = { contractId: 'c1' };
    mockContractsApi.offer.mockResolvedValue(contract);
    render(<OfferContractModal open onClose={vi.fn()} player={player} onOffered={onOffered} />);

    await user.click(await screen.findByLabelText('Match contract'));
    const length = screen.getByLabelText('Length (matches)');
    await user.clear(length);
    await user.type(length, '8');
    const pay = screen.getByLabelText('Pay per match ($)');
    await user.clear(pay);
    await user.type(pay, '200');
    await user.click(screen.getByRole('button', { name: 'Send offer' }));

    await waitFor(() => expect(mockContractsApi.offer).toHaveBeenCalledWith({
      playerId: 'p1',
      type: 'matches',
      matchesTotal: 8,
      perMatchPay: 200,
      weeklySalary: 0,
      winBonus: 75,
    }));
    expect(onOffered).toHaveBeenCalledWith(contract, player);
  });

  it('blocks an offer with no pay', async () => {
    const user = userEvent.setup();
    render(<OfferContractModal open onClose={vi.fn()} player={player} onOffered={vi.fn()} />);

    await user.click(await screen.findByLabelText('Match contract'));
    await user.clear(screen.getByLabelText('Pay per match ($)'));
    await user.type(screen.getByLabelText('Pay per match ($)'), '0');

    expect(screen.getByText('Set a pay per match or a weekly salary above 0.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send offer' })).toBeDisabled();
  });

  it('shows the server\'s reasons when it refuses the offer', async () => {
    const user = userEvent.setup();
    mockContractsApi.offer.mockRejectedValue(new ApiError('The offer is not valid', 400, {
      body: { errors: [{ code: 'seasonNotActive', message: 'seasonId must be the active season' }] },
    }));
    render(<OfferContractModal open onClose={vi.fn()} player={player} onOffered={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Send offer' }));

    expect(await screen.findByText('A season contract can only be for the active season.')).toBeInTheDocument();
  });
});
