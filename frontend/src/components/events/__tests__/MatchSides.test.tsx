import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import MatchSides from '../MatchSides';

const participants = ['p1', 'p2', 'p3', 'p4'].map((playerId) => ({
  playerId,
  playerName: `Player ${playerId}`,
  wrestlerName: `Wrestler ${playerId}`,
}));
const teams = [['p1', 'p2'], ['p3', 'p4']];

describe('MatchSides tag team billing (TTB-02)', () => {
  it('shows a team side by its name with its members underneath', () => {
    const { container } = render(
      <MatchSides
        participants={participants}
        teams={teams}
        sideTagTeams={[{ tagTeamId: 'usos', name: 'The Usos', imageUrl: 'https://example.com/usos.png' }, null]}
        matchFormat="tag"
      />,
    );

    const teamName = screen.getByText('The Usos');
    const label = teamName.closest('.match-side-label');
    expect(label).toHaveTextContent('Wrestler p1');
    expect(label).toHaveTextContent('Wrestler p2');
    expect(label?.querySelector('img')).toHaveAttribute('src', 'https://example.com/usos.png');

    // The side without a team is its members alone.
    const sides = container.querySelectorAll('.event-match__side');
    expect(sides[1]?.querySelector('.match-side-label')).toBeNull();
    expect(sides[1]).toHaveTextContent('Wrestler p3');
    expect(sides[1]).toHaveTextContent('Wrestler p4');
  });

  it('marks the winning team name', () => {
    render(
      <MatchSides
        participants={participants}
        teams={teams}
        sideTagTeams={[null, { tagTeamId: 'nd', name: 'New Day' }]}
        matchFormat="tag"
        winners={['p3', 'p4']}
        losers={['p1', 'p2']}
      />,
    );

    expect(screen.getByText('New Day')).toHaveClass('event-match__team', 'is-winner');
  });

  it('renders no team labels when the match has none', () => {
    const { container } = render(<MatchSides participants={participants} teams={teams} matchFormat="tag" />);

    expect(container.querySelector('.match-side-label')).toBeNull();
    expect(screen.getByText('Wrestler p1')).toBeInTheDocument();
  });
});
