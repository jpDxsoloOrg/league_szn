import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { SimBeat } from '../../../types';

const stableT = (key: string, options?: Record<string, unknown>) =>
  (options ? `${key} ${Object.values(options).join(' ')}` : key);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stableT }) }));

import SimResultPanel, { BEAT_REVEAL_MS } from '../SimResultPanel';
import { buildSimSides, matchSimSides, sidesFromOdds } from '../simSides';

const beats: SimBeat[] = [
  { key: 'sim.beats.opening.v1', params: { wrestler: 'Cena', opponent: 'Rock' } },
  { key: 'sim.beats.signature.v2', params: { wrestler: 'Cena', opponent: 'Rock', move: 'AA' } },
  { key: 'sim.beats.finishPin.v1', params: { wrestler: 'Cena', opponent: 'Rock' } },
];

const names: Record<string, string> = { p1: 'Cena', p2: 'Rock', p3: 'Edge', p4: 'Christian' };
const nameOf = (playerId: string) => names[playerId] ?? playerId;

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
}

describe('SimResultPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows an odds bar per side, the winner and the specialty marker', () => {
    const sides = sidesFromOdds(
      [
        { sideId: 'side-1', playerIds: ['p1'], pct: 62.5 },
        { sideId: 'side-2', playerIds: ['p2'], pct: 37.5 },
      ],
      nameOf,
    );
    render(
      <SimResultPanel sides={sides} category="hardcore" winnerSideId="side-1" specialtyHits={['p1']} playByPlay={beats} seed={7} />,
    );

    const winnerSide = screen.getByTestId('sim-side-side-1');
    expect(within(winnerSide).getByText('Cena')).toBeInTheDocument();
    expect(within(winnerSide).getByText('sim.panel.winner')).toBeInTheDocument();
    expect(within(winnerSide).getByRole('progressbar')).toHaveAttribute('value', '62.5');
    expect(within(winnerSide).getByText('sim.panel.inSpecialtyNamed Cena')).toBeInTheDocument();
    expect(within(screen.getByTestId('sim-side-side-2')).getByRole('progressbar')).toHaveAttribute('value', '37.5');
    expect(screen.getByText('sim.panel.category simCategories.hardcore')).toBeInTheDocument();
  });

  it('draws no odds when the sides carry none (the public view)', () => {
    const sides = buildSimSides({ sides: matchSimSides({ participants: ['p1', 'p2'] }), nameOf });
    render(
      <SimResultPanel sides={sides} category="standard" winnerSideId="side-2" specialtyHits={[]} playByPlay={beats} seed={7} />,
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('sim-side-side-2')).getByText('sim.panel.winner')).toBeInTheDocument();
  });

  it('bills a tag side by its team name and lists the members', () => {
    const sides = buildSimSides({
      sides: matchSimSides({ participants: ['p1', 'p2', 'p3', 'p4'], teams: [['p1', 'p2'], ['p3', 'p4']] }),
      nameOf,
      sideTagTeams: [{ tagTeamId: 't1', name: 'The Champs' }, null],
    });
    render(<SimResultPanel sides={sides} category="standard" specialtyHits={['p3']} playByPlay={[]} seed={1} />);

    const teamSide = screen.getByTestId('sim-side-side-1');
    expect(within(teamSide).getByText('The Champs')).toBeInTheDocument();
    expect(within(teamSide).getByText('Cena')).toBeInTheDocument();
    expect(within(screen.getByTestId('sim-side-side-2')).getByText('Edge & Christian')).toBeInTheDocument();
    expect(within(screen.getByTestId('sim-side-side-2')).getByText('sim.panel.inSpecialty')).toBeInTheDocument();
  });

  // INJ-09
  it('shows stamina and an injured marker per competitor when conditions are given', () => {
    const sides = buildSimSides({
      sides: matchSimSides({ participants: ['p1', 'p2', 'p3', 'p4'], teams: [['p1', 'p2'], ['p3', 'p4']] }),
      nameOf,
    });
    render(
      <SimResultPanel
        sides={sides}
        category="standard"
        specialtyHits={[]}
        conditions={[
          { playerId: 'p1', stamina: 100, maxStamina: 100, injured: false, multiplier: 1 },
          { playerId: 'p3', stamina: 20.4, maxStamina: 100, injured: true, multiplier: 0.66 },
        ]}
        playByPlay={[]}
        seed={1}
      />,
    );

    const hurtSide = screen.getByTestId('sim-side-side-2');
    expect(within(hurtSide).getByText('sim.panel.stamina 20 100')).toBeInTheDocument();
    expect(within(hurtSide).getByText('sim.panel.injured')).toBeInTheDocument();
    const freshSide = screen.getByTestId('sim-side-side-1');
    expect(within(freshSide).getByText('sim.panel.stamina 100 100')).toBeInTheDocument();
    expect(within(freshSide).queryByText('sim.panel.injured')).not.toBeInTheDocument();
  });

  it('names the wrestler on the markers in singles and shows none without conditions', () => {
    const sides = sidesFromOdds(
      [
        { sideId: 'side-1', playerIds: ['p1'], pct: 70 },
        { sideId: 'side-2', playerIds: ['p2'], pct: 30 },
      ],
      nameOf,
    );
    const { rerender } = render(
      <SimResultPanel
        sides={sides}
        category="standard"
        specialtyHits={[]}
        conditions={[{ playerId: 'p2', stamina: 15, maxStamina: 100, injured: true, multiplier: 0.7 }]}
        playByPlay={[]}
        seed={1}
      />,
    );
    expect(screen.getByText('sim.panel.staminaNamed Rock 15 100')).toBeInTheDocument();
    expect(screen.getByText('sim.panel.injuredNamed Rock')).toBeInTheDocument();

    rerender(<SimResultPanel sides={sides} category="standard" specialtyHits={[]} playByPlay={[]} seed={1} />);
    expect(screen.queryByText(/sim\.panel\.stamina/)).not.toBeInTheDocument();
  });

  // ECO-10
  it('marks a competitor with a bought sim boost', () => {
    const sides = sidesFromOdds(
      [
        { sideId: 'side-1', playerIds: ['p1'], pct: 55 },
        { sideId: 'side-2', playerIds: ['p2'], pct: 45 },
      ],
      nameOf,
    );
    render(
      <SimResultPanel
        sides={sides}
        category="standard"
        specialtyHits={[]}
        boosts={[{ playerId: 'p1', boost: 5, multiplier: 1.05 }]}
        playByPlay={[]}
        seed={1}
      />,
    );
    expect(within(screen.getByTestId('sim-side-side-1')).getByText('sim.panel.boostNamed Cena 5')).toBeInTheDocument();
    expect(within(screen.getByTestId('sim-side-side-2')).queryByText(/sim\.panel\.boost/)).not.toBeInTheDocument();
  });

  it('reveals the play-by-play beat by beat, rendered from the beat keys and params', () => {
    render(<SimResultPanel sides={[]} category="standard" specialtyHits={[]} playByPlay={beats} seed={3} />);

    expect(screen.getAllByRole('listitem').filter((item) => item.classList.contains('sim-story__beat'))).toHaveLength(1);
    expect(screen.getByText('sim.beats.opening.v1 Cena Rock')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(BEAT_REVEAL_MS); });
    expect(screen.getByText('sim.beats.signature.v2 Cena Rock AA')).toBeInTheDocument();
    expect(screen.queryByText('sim.beats.finishPin.v1 Cena Rock')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(BEAT_REVEAL_MS); });
    expect(screen.getByText('sim.beats.finishPin.v1 Cena Rock')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'sim.panel.skip' })).not.toBeInTheDocument();
  });

  it('shows the whole story on skip', () => {
    render(<SimResultPanel sides={[]} category="standard" specialtyHits={[]} playByPlay={beats} seed={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'sim.panel.skip' }));
    expect(screen.getByText('sim.beats.finishPin.v1 Cena Rock')).toBeInTheDocument();
  });

  it('shows the whole story at once with reduced motion', () => {
    setReducedMotion(true);
    render(<SimResultPanel sides={[]} category="standard" specialtyHits={[]} playByPlay={beats} seed={3} />);
    expect(screen.getByText('sim.beats.finishPin.v1 Cena Rock')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'sim.panel.skip' })).not.toBeInTheDocument();
  });
});
