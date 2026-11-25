import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PlayerCondition, PublicCurrentInjury } from '../../../types/injury';

const { mockInjuriesApi, mockUseAuth, mockFeatures } = vi.hoisted(() => ({
  mockInjuriesApi: { getPlayerCondition: vi.fn(), getPlayerHistory: vi.fn() },
  mockUseAuth: vi.fn(),
  mockFeatures: { injuries: true },
}));

vi.mock('../../../services/api/injuries.api', () => ({ injuriesApi: mockInjuriesApi }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../../../contexts/SiteConfigContext', () => ({ useSiteConfig: () => ({ features: mockFeatures }) }));

import i18n from '../../../i18n';
import DashboardStamina from '../DashboardStamina';
import InjuryBadge from '../InjuryBadge';
import InjuryHistory from '../InjuryHistory';
import StaminaMeter from '../StaminaMeter';
import { staminaTone } from '../injuryDisplay';

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number): string => new Date(Date.now() + days * DAY_MS).toISOString();

const injury = (returnsAt: string): PublicCurrentInjury => ({
  injuryId: 'i1', startedAt: inDays(-3), returnsAt, severity: 'moderate', weeks: 2,
});

function condition(overrides: Partial<PlayerCondition> = {}): PlayerCondition {
  return {
    playerId: 'p1',
    stamina: 35,
    maxStamina: 100,
    band: 2,
    bandCount: 4,
    weeklyRecovery: 'full',
    nextRecoveryAt: inDays(3),
    currentInjury: null,
    nextMatch: null,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
  mockFeatures.injuries = true;
  mockUseAuth.mockReturnValue({ isAuthenticated: true, isWrestler: true, playerId: 'p1' });
});

describe('InjuryBadge', () => {
  it('says when an injured player returns', () => {
    render(<InjuryBadge injury={injury(inDays(10))} />);
    expect(screen.getByTestId('injury-badge')).toHaveTextContent(/^Injured, returns /);
  });

  it('stays hidden once the return date has passed', () => {
    const { container } = render(<InjuryBadge injury={injury(inDays(-1))} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays hidden while the injuries feature is off', () => {
    mockFeatures.injuries = false;
    const { container } = render(<InjuryBadge injury={injury(inDays(10))} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('StaminaMeter', () => {
  it('shows stamina out of the maximum, the Sunday recovery and the next match drain', () => {
    render(<StaminaMeter condition={condition({
      nextMatch: { matchId: 'm1', date: inDays(1), drain: 15, staminaAfter: 20 },
    })} />);

    expect(screen.getByText('35 / 100')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Stamina 35 of 100' })).toHaveAttribute('value', '35');
    expect(screen.getByText(/^Recovers on Sunday: back to full on /)).toBeInTheDocument();
    expect(screen.getByText(/uses 15 stamina, leaving 20\.$/)).toBeInTheDocument();
    expect(screen.getByTestId('stamina-meter')).toHaveClass('stamina-meter--mid');
  });

  it('shows a partial weekly recovery and the return date of an open injury', () => {
    render(<StaminaMeter condition={condition({
      band: 3, weeklyRecovery: 30, currentInjury: injury(inDays(10)),
    })} />);

    expect(screen.getByText(/^Recovers on Sunday: \+30 on /)).toBeInTheDocument();
    expect(screen.getByText(/^Out until /)).toBeInTheDocument();
    expect(screen.getByTestId('stamina-meter')).toHaveClass('stamina-meter--low');
  });

  it('says when stamina is already full', () => {
    render(<StaminaMeter condition={condition({ stamina: 100, band: 0 })} />);
    expect(screen.getByText('Stamina is full.')).toBeInTheDocument();
    expect(screen.getByTestId('stamina-meter')).toHaveClass('stamina-meter--high');
  });
});

describe('staminaTone', () => {
  it('maps the safest band to high, the riskiest to low and the rest to mid', () => {
    expect(staminaTone(0, 4)).toBe('high');
    expect(staminaTone(1, 4)).toBe('mid');
    expect(staminaTone(3, 4)).toBe('low');
    expect(staminaTone(0, 1)).toBe('high');
  });
});

describe('DashboardStamina', () => {
  const renderCard = () => render(<MemoryRouter><DashboardStamina /></MemoryRouter>);

  it('shows a wrestler their own stamina', async () => {
    mockInjuriesApi.getPlayerCondition.mockResolvedValue(condition());
    renderCard();

    expect(await screen.findByTestId('stamina-meter')).toBeInTheDocument();
    expect(mockInjuriesApi.getPlayerCondition).toHaveBeenCalledWith('p1', expect.anything());
    expect(screen.getByRole('link', { name: 'Your profile' })).toHaveAttribute('href', '/profile');
  });

  it('asks for nothing for a viewer without a player', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isWrestler: false, playerId: null });
    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
    expect(mockInjuriesApi.getPlayerCondition).not.toHaveBeenCalled();
  });

  it('asks for nothing while the injuries feature is off', () => {
    mockFeatures.injuries = false;
    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
    expect(mockInjuriesApi.getPlayerCondition).not.toHaveBeenCalled();
  });

  it('stays hidden when the request fails', async () => {
    mockInjuriesApi.getPlayerCondition.mockRejectedValue(new Error('Forbidden'));
    const { container } = renderCard();

    await waitFor(() => expect(mockInjuriesApi.getPlayerCondition).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('InjuryHistory', () => {
  it('lists severity, weeks out and the match an injury came from', async () => {
    mockInjuriesApi.getPlayerHistory.mockResolvedValue([
      { injuryId: 'i2', startedAt: inDays(-40), returnsAt: inDays(-26), endedAt: inDays(-26), severity: 'moderate', weeks: 2, matchId: 'm9' },
      { injuryId: 'i1', startedAt: inDays(-90), returnsAt: inDays(-83), endedAt: inDays(-83), severity: 'minor', weeks: 1 },
    ]);
    render(<InjuryHistory playerId="p1" matches={[{ matchId: 'm9', date: inDays(-40) } as never]} />);

    expect(await screen.findByText('Moderate, 2 weeks out')).toBeInTheDocument();
    expect(screen.getByText('Minor, 1 week out')).toBeInTheDocument();
    expect(screen.getAllByText(/^From the match on /)).toHaveLength(1);
  });

  it('renders nothing for a player who has never been injured', async () => {
    mockInjuriesApi.getPlayerHistory.mockResolvedValue([]);
    const { container } = render(<InjuryHistory playerId="p1" />);

    await waitFor(() => expect(mockInjuriesApi.getPlayerHistory).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
