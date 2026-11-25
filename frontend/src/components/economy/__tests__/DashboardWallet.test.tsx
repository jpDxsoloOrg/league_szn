import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockContractsApi, mockEconomyApi, mockUseAuth, mockFeatures } = vi.hoisted(() => ({
  mockContractsApi: { getMyLedger: vi.fn() },
  mockEconomyApi: { getCatalog: vi.fn() },
  mockUseAuth: vi.fn(),
  mockFeatures: { economy: true },
}));

vi.mock('../../../services/api/contracts.api', () => ({ contractsApi: mockContractsApi }));
vi.mock('../../../services/api/economy.api', () => ({ economyApi: mockEconomyApi }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../../../contexts/SiteConfigContext', () => ({ useSiteConfig: () => ({ features: mockFeatures }) }));

import i18n from '../../../i18n';
import DashboardWallet from '../DashboardWallet';

function renderCard() {
  return render(<MemoryRouter><DashboardWallet /></MemoryRouter>);
}

describe('DashboardWallet', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    mockFeatures.economy = true;
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isWrestler: true, playerId: 'p1' });
    mockEconomyApi.getCatalog.mockResolvedValue({ currencySymbol: '$', currencyName: 'Dollars', version: 1, items: [] });
    mockContractsApi.getMyLedger.mockResolvedValue({
      playerId: 'p1',
      balance: 1250,
      items: [
        {
          playerId: 'p1', entryId: 'e1', createdAt: new Date().toISOString(), sortKey: '',
          kind: 'perMatchPay', amount: 150, balanceAfter: 1250,
        },
        {
          playerId: 'p1', entryId: 'e0', createdAt: new Date().toISOString(), sortKey: '',
          kind: 'fine', amount: -50, balanceAfter: 1100,
        },
      ],
    });
  });

  it('shows the balance, this week\'s earnings and the next payday', async () => {
    renderCard();

    expect(await screen.findByText('$1,250')).toBeInTheDocument();
    expect(screen.getByText('Earned this week')).toBeInTheDocument();
    expect(screen.getByText('$150')).toBeInTheDocument();
    expect(screen.getByText('Next payday')).toBeInTheDocument();
    expect(screen.getByText(/Sunday/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Wallet history/ })).toHaveAttribute('href', '/my-contract?tab=wallet');
  });

  it('shows debt in red', async () => {
    mockContractsApi.getMyLedger.mockResolvedValue({ playerId: 'p1', balance: -40, items: [] });

    renderCard();

    expect(await screen.findByText('-$40')).toHaveClass('dashboard-wallet__value--debt');
  });

  it('stays hidden while the economy is off', () => {
    mockFeatures.economy = false;

    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
    expect(mockContractsApi.getMyLedger).not.toHaveBeenCalled();
    expect(mockEconomyApi.getCatalog).not.toHaveBeenCalled();
  });

  it('stays hidden for someone without a player', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isWrestler: false, playerId: null });

    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
    expect(mockContractsApi.getMyLedger).not.toHaveBeenCalled();
  });
});
