import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Match, SimulateOfficialResponse, SimulatePreviewResponse, StoredMatchSimulation } from '../../../types';

const { mockSimulate, mockSimulateOfficial, authState } = vi.hoisted(() => ({
  mockSimulate: vi.fn(),
  mockSimulateOfficial: vi.fn(),
  authState: { isAdminOrModerator: true },
}));

vi.mock('../../../services/api', () => ({
  matchesApi: { simulate: mockSimulate, simulateOfficial: mockSimulateOfficial },
}));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => authState }));

const stableT = (key: string, options?: Record<string, unknown>) =>
  (options ? `${key} ${Object.values(options).join(' ')}` : key);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

import SimMatchActions from '../SimMatchActions';
import { SimulatedBadge, SimulatedMatchStory } from '../SimulatedMatch';
import { isSimulatedMatch } from '../simSides';

const names: Record<string, string> = { p1: 'Cena', p2: 'Rock' };
const nameOf = (playerId: string) => names[playerId] ?? playerId;

const scheduledMatch: Pick<Match, 'matchId' | 'status' | 'participants' | 'teams' | 'sideTagTeams'> = {
  matchId: 'm1',
  status: 'scheduled',
  participants: ['p1', 'p2'],
};

const preview: SimulatePreviewResponse = {
  seed: 11,
  category: 'standard',
  probabilities: [
    { sideId: 'side-1', playerIds: ['p1'], pct: 58.2 },
    { sideId: 'side-2', playerIds: ['p2'], pct: 41.8 },
  ],
  winnerSideId: 'side-2',
  playByPlay: [{ key: 'sim.beats.opening.v1', params: { wrestler: 'Cena', opponent: 'Rock' } }],
  specialtyHits: [],
  matchId: 'm1',
  scaledPlayerIds: [],
  formWindow: { kind: 'recent', matchLimit: 10 },
  inputsDigest: 'abc',
  rulesVersion: 1,
};

const official: SimulateOfficialResponse = {
  message: 'Match simulated and result recorded',
  match: { matchId: 'm1', resultSource: 'simulation' },
  simulation: {
    ...preview,
    seed: 99,
    winnerSideId: 'side-1',
    playByPlay: [{ key: 'sim.beats.finishPin.v1', params: { wrestler: 'Cena', opponent: 'Rock' } }],
  },
};

describe('SimMatchActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isAdminOrModerator = true;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });

  it('renders no sim controls for a Wrestler', () => {
    authState.isAdminOrModerator = false;
    const { container } = render(<SimMatchActions match={scheduledMatch} nameOf={nameOf} onRecorded={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'sim.actions.preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'sim.actions.simulateRecord' })).not.toBeInTheDocument();
  });

  it('renders nothing for a match that is not scheduled', () => {
    const { container } = render(
      <SimMatchActions match={{ ...scheduledMatch, status: 'completed' }} nameOf={nameOf} onRecorded={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('previews the match for a GM without recording it', async () => {
    mockSimulate.mockResolvedValue(preview);
    render(<SimMatchActions match={scheduledMatch} nameOf={nameOf} onRecorded={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'sim.actions.preview' }));

    expect(mockSimulate).toHaveBeenCalledWith({ matchId: 'm1' });
    expect(mockSimulateOfficial).not.toHaveBeenCalled();
    expect(await screen.findByTestId('sim-result-panel')).toBeInTheDocument();
    expect(screen.getByText('sim.actions.previewNote')).toBeInTheDocument();
    expect(screen.getByText('sim.beats.opening.v1 Cena Rock')).toBeInTheDocument();
  });

  it('shows the odds before recording, then records with the official sim and shows the result', async () => {
    mockSimulate.mockResolvedValue(preview);
    mockSimulateOfficial.mockResolvedValue(official);
    const onRecorded = vi.fn();
    render(<SimMatchActions match={scheduledMatch} nameOf={nameOf} onRecorded={onRecorded} />);

    await userEvent.click(screen.getByRole('button', { name: 'sim.actions.simulateRecord' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('sim.actions.confirmMessage');
    await waitFor(() => expect(screen.getByTestId('sim-side-side-1')).toHaveTextContent('58.2'));
    // The confirm step shows odds only, not the preview's winner or story.
    expect(screen.queryByText('sim.panel.winner')).not.toBeInTheDocument();
    expect(mockSimulateOfficial).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'sim.actions.confirmRecord' }));

    expect(mockSimulateOfficial).toHaveBeenCalledWith('m1');
    expect(await screen.findByText('sim.actions.resultTitle')).toBeInTheDocument();
    expect(screen.getByText('sim.beats.finishPin.v1 Cena Rock')).toBeInTheDocument();
    expect(onRecorded).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'sim.actions.done' }));
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  it('shows the API error when the official sim fails', async () => {
    mockSimulate.mockResolvedValue(preview);
    mockSimulateOfficial.mockRejectedValue(new Error('Match is not scheduled, so it cannot be simulated'));
    const onRecorded = vi.fn();
    render(<SimMatchActions match={scheduledMatch} nameOf={nameOf} onRecorded={onRecorded} />);

    await userEvent.click(screen.getByRole('button', { name: 'sim.actions.simulateRecord' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'sim.actions.confirmRecord' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'sim.actions.confirmRecord' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Match is not scheduled');
    expect(onRecorded).not.toHaveBeenCalled();
  });
});

describe('SimulatedMatch', () => {
  const stored: StoredMatchSimulation = {
    seed: 5,
    category: 'cage',
    rulesVersion: 1,
    winnerSideId: 'side-1',
    playByPlay: [{ key: 'sim.beats.finishPin.v1', params: { wrestler: 'Cena', opponent: 'Rock' } }],
    specialtyHits: [],
    simulatedAt: '2026-01-01T00:00:00.000Z',
    probabilities: [
      { sideId: 'side-1', playerIds: ['p1'], pct: 70 },
      { sideId: 'side-2', playerIds: ['p2'], pct: 30 },
    ],
  };

  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });

  it('knows a simulated match by its result source', () => {
    expect(isSimulatedMatch({ resultSource: 'simulation', simulation: stored })).toBe(true);
    expect(isSimulatedMatch({ resultSource: 'manual' })).toBe(false);
    expect(isSimulatedMatch({})).toBe(false);
  });

  it('shows the Simulated badge', () => {
    render(<SimulatedBadge />);
    expect(screen.getByTestId('simulated-badge')).toHaveTextContent('sim.badge');
  });

  it('shows the story but never the odds to non-staff', () => {
    authState.isAdminOrModerator = false;
    render(<SimulatedMatchStory match={{ participants: ['p1', 'p2'] }} simulation={stored} nameOf={nameOf} />);
    expect(screen.getByText('sim.beats.finishPin.v1 Cena Rock')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('70')).not.toBeInTheDocument();
  });

  it('shows the stored odds to staff', () => {
    authState.isAdminOrModerator = true;
    render(<SimulatedMatchStory match={{ participants: ['p1', 'p2'] }} simulation={stored} nameOf={nameOf} />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
  });
});
