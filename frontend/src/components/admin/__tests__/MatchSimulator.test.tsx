import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Player, SimulatePreviewResponse } from '../../../types';

const { mockSimulate, mockGetPlayers, mockGetStipulations, mockGetMatchTypes } = vi.hoisted(() => ({
  mockSimulate: vi.fn(),
  mockGetPlayers: vi.fn(),
  mockGetStipulations: vi.fn(),
  mockGetMatchTypes: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  matchesApi: { simulate: mockSimulate },
  playersApi: { getAll: mockGetPlayers },
  stipulationsApi: { getAll: mockGetStipulations },
  matchTypesApi: { getAll: mockGetMatchTypes },
}));

const stableT = (key: string, options?: Record<string, unknown>) =>
  (options ? `${key} ${Object.values(options).join(' ')}` : key);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

import MatchSimulator from '../MatchSimulator';

function player(playerId: string, name: string, currentWrestler: string): Player {
  return { playerId, name, currentWrestler, wins: 0, losses: 0, draws: 0, createdAt: 'x', updatedAt: 'x' };
}

const players = [player('p1', 'Alice', 'Cena'), player('p2', 'Bob', 'Rock'), player('p3', 'Cara', 'Edge')];

const preview: SimulatePreviewResponse = {
  seed: 4,
  category: 'hardcore',
  probabilities: [
    { sideId: 'side-1', playerIds: ['p1'], pct: 55 },
    { sideId: 'side-2', playerIds: ['p2', 'p3'], pct: 45 },
  ],
  winnerSideId: 'side-1',
  playByPlay: [{ key: 'sim.beats.opening.v1', params: { wrestler: 'Cena', opponent: 'Rock' } }],
  specialtyHits: ['p1'],
  scaledPlayerIds: [],
  formWindow: { kind: 'recent', matchLimit: 10 },
  inputsDigest: 'abc',
  rulesVersion: 1,
};

describe('MatchSimulator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlayers.mockResolvedValue(players);
    mockGetStipulations.mockResolvedValue([
      { stipulationId: 'st1', name: 'Hardcore', simCategory: 'hardcore', createdAt: 'x', updatedAt: 'x' },
    ]);
    mockGetMatchTypes.mockResolvedValue([]);
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });

  it('previews the picked sides and stipulation and shows the odds', async () => {
    mockSimulate.mockResolvedValue(preview);
    render(<MatchSimulator />);

    const firstSlot = await screen.findByLabelText('sim.simulator.memberLabel 1 1');
    const submit = screen.getByRole('button', { name: 'sim.actions.preview' });
    expect(submit).toBeDisabled();

    await userEvent.selectOptions(firstSlot, 'p1');
    await userEvent.selectOptions(screen.getByLabelText('sim.simulator.memberLabel 2 1'), 'p2');
    await userEvent.click(screen.getAllByRole('button', { name: 'sim.simulator.addPartner' })[1]!);
    await userEvent.selectOptions(screen.getByLabelText('sim.simulator.memberLabel 2 2'), 'p3');
    await userEvent.selectOptions(screen.getByLabelText('sim.simulator.stipulation'), 'st1');

    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    expect(mockSimulate).toHaveBeenCalledWith({ sides: [['p1'], ['p2', 'p3']], stipulationId: 'st1' });
    const panel = await screen.findByTestId('sim-result-panel');
    expect(panel).toHaveTextContent('Rock & Edge');
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    expect(screen.getByText('sim.panel.inSpecialtyNamed Cena')).toBeInTheDocument();
  });

  it('will not put one wrestler on two sides', async () => {
    render(<MatchSimulator />);
    await userEvent.selectOptions(await screen.findByLabelText('sim.simulator.memberLabel 1 1'), 'p1');

    const otherSide = screen.getByLabelText('sim.simulator.memberLabel 2 1');
    const takenOption = Array.from((otherSide as HTMLSelectElement).options).find((option) => option.value === 'p1');
    expect(takenOption?.disabled).toBe(true);
  });

  it('adds up to four sides', async () => {
    render(<MatchSimulator />);
    await screen.findByLabelText('sim.simulator.memberLabel 1 1');
    await userEvent.click(screen.getByRole('button', { name: 'sim.simulator.addSide' }));
    await userEvent.click(screen.getByRole('button', { name: 'sim.simulator.addSide' }));
    await waitFor(() => expect(screen.getByLabelText('sim.simulator.memberLabel 4 1')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'sim.simulator.addSide' })).not.toBeInTheDocument();
  });
});
