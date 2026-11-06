import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Division, Player } from '../../../types';

const { mockFeatures, mockGetMyRequests, mockGetMine, mockGetPlayers } = vi.hoisted(() => ({
  mockFeatures: { transfers: false },
  mockGetMyRequests: vi.fn(),
  mockGetMine: vi.fn(),
  mockGetPlayers: vi.fn(),
}));

vi.mock('../../../contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({ features: mockFeatures, isLoading: false }),
}));
vi.mock('../../../services/api', () => ({
  transfersApi: { getMyRequests: mockGetMyRequests, createRequest: vi.fn() },
  storylineRequestsApi: { getMine: mockGetMine, create: vi.fn() },
  playersApi: { getAll: mockGetPlayers },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import ProfileRequests from '../ProfileRequests';

const player = { playerId: 'p1', name: 'Alex', currentWrestler: 'The Rock', divisionId: 'd1' } as Player;
const divisions = [
  { divisionId: 'd1', name: 'Raw' },
  { divisionId: 'd2', name: 'SmackDown' },
] as Division[];
const pastTransfer = {
  requestId: 'r1',
  status: 'approved',
  fromDivisionName: 'Raw',
  toDivisionName: 'SmackDown',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

describe('ProfileRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatures.transfers = false;
    mockGetMyRequests.mockResolvedValue([pastTransfer]);
    mockGetMine.mockResolvedValue([]);
    mockGetPlayers.mockResolvedValue([]);
  });

  it('shows no transfer UI and asks for no transfers while the feature is off', async () => {
    render(<ProfileRequests player={player} divisions={divisions} />);

    expect(await screen.findByText('me.requests.storylineTitle')).toBeInTheDocument();
    await waitFor(() => expect(mockGetMine).toHaveBeenCalled());
    expect(screen.queryByText('me.requests.transferTitle')).not.toBeInTheDocument();
    expect(screen.queryByText('me.requests.transferHistory')).not.toBeInTheDocument();
    expect(mockGetMyRequests).not.toHaveBeenCalled();
  });

  it('shows the transfer form and history while the feature is on', async () => {
    mockFeatures.transfers = true;
    render(<ProfileRequests player={player} divisions={divisions} />);

    expect(await screen.findByText('me.requests.transferHistory')).toBeInTheDocument();
    expect(screen.getByText('me.requests.transferTitle')).toBeInTheDocument();
  });
});
