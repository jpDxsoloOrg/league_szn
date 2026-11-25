import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Player } from '../../../types';

const { mockGetMyProfile } = vi.hoisted(() => ({ mockGetMyProfile: vi.fn() }));

vi.mock('../../../services/api', () => ({
  profileApi: { getMyProfile: mockGetMyProfile, updateMyProfile: vi.fn() },
  isApiError: () => false,
  overallsApi: { getMyOverall: vi.fn().mockResolvedValue(null) },
  transfersApi: { getMyRequests: vi.fn().mockResolvedValue([]), create: vi.fn() },
  divisionsApi: { getAll: vi.fn().mockResolvedValue([]) },
  storylineRequestsApi: { getMine: vi.fn().mockResolvedValue([]), create: vi.fn() },
  playersApi: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isWrestler: true, playerId: 'p1', refreshProfile: vi.fn() }),
}));

vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({ features: {}, tickerSettings: { publicRelegationWatch: false }, isLoading: false, refreshConfig: vi.fn() }),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The card shows both actions so the wiring can be checked without its data.
vi.mock('../BuildCard', () => ({
  default: ({ setupAction, editAction }: { setupAction?: ReactNode; editAction?: ReactNode }) => (
    <div data-testid="build-card-stub">{setupAction}{editAction}</div>
  ),
}));

vi.mock('../BuildEditor', () => ({
  default: ({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) => (
    <div data-testid="build-editor-stub">
      <button type="button" onClick={onSaved}>save-build</button>
      <button type="button" onClick={onCancel}>cancel-build</button>
    </div>
  ),
}));

vi.mock('../../statistics/EmbeddedPlayerStats', () => ({ default: () => null }));
vi.mock('../../progression/CallUpProgress', () => ({ default: () => null }));
vi.mock('../../progression/ConsiderationBanner', () => ({ default: () => null }));
vi.mock('../../progression/DivisionHistory', () => ({ default: () => null }));
vi.mock('../../progression/DivisionProgress', () => ({ default: () => null }));
vi.mock('../../progression/DivisionWatchBanners', () => ({ default: () => null }));
vi.mock('../ProfileRequests', () => ({ default: () => null }));

import WrestlerProfile from '../WrestlerProfile';

const player = {
  playerId: 'p1',
  name: 'Alice',
  currentWrestler: 'Alpha',
  currentWrestlerId: 'w1',
  wins: 0,
  losses: 0,
  draws: 0,
} as unknown as Player;

describe('WrestlerProfile build editor wiring (BLD-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMyProfile.mockResolvedValue(player);
  });

  it('opens the editor from the build card and returns to the card after saving', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><WrestlerProfile /></MemoryRouter>);

    await screen.findByTestId('build-card-stub');
    await user.click(screen.getByRole('button', { name: 'builds.editor.edit' }));
    expect(screen.getByTestId('build-editor-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('build-card-stub')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'save-build' }));
    expect(await screen.findByTestId('build-card-stub')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('builds.editor.saved');
  });

  it('opens the editor straight away when a link asks for it', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/profile', state: { editBuild: true } }]}>
        <WrestlerProfile />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('build-editor-stub')).toBeInTheDocument();
  });
});
