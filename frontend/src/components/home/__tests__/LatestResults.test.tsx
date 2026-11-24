import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardMatch } from '../../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key) }),
}));

import LatestResults from '../LatestResults';

const tagResult: DashboardMatch = {
  matchId: 'm1',
  date: '2026-11-20T20:00:00.000Z',
  matchType: 'tag',
  winnerName: 'Jey Uso & Jimmy Uso',
  loserName: 'Kofi & Woods',
  teams: [['p1', 'p2'], ['p3', 'p4']],
  winners: ['p1', 'p2'],
  sideTagTeams: [{ tagTeamId: 'usos', name: 'The Usos' }, { tagTeamId: 'nd', name: 'New Day' }],
};

function renderResults(results: DashboardMatch[]) {
  return render(
    <MemoryRouter>
      <LatestResults results={results} />
    </MemoryRouter>,
  );
}

describe('LatestResults tag team billing (TTB-02)', () => {
  it('reads "{team} def. {team}" when both sides were teams', () => {
    const { container } = renderResults([tagResult]);

    expect(container.querySelector('.home-result__winner')).toHaveTextContent('The Usos');
    expect(container.querySelector('.home-result__loser')).toHaveTextContent('New Day');
  });

  it('uses member names for a side that was not a team', () => {
    const { container } = renderResults([{ ...tagResult, sideTagTeams: [{ tagTeamId: 'usos', name: 'The Usos' }, null] }]);

    expect(container.querySelector('.home-result__winner')).toHaveTextContent('The Usos');
    expect(container.querySelector('.home-result__loser')).toHaveTextContent('Kofi & Woods');
  });

  it('keeps member names when the match has no teams', () => {
    renderResults([{ ...tagResult, teams: undefined, winners: undefined, sideTagTeams: undefined }]);

    expect(screen.getByText('Jey Uso & Jimmy Uso')).toBeInTheDocument();
    expect(screen.getByText('Kofi & Woods')).toBeInTheDocument();
  });
});
