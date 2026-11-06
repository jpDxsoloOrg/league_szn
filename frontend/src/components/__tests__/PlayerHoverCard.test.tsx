import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import PlayerHoverCard from '../PlayerHoverCard';

const player = {
  playerId: 'p1',
  name: 'John Cena',
  currentWrestler: 'The Champ',
  wins: 1,
  losses: 0,
  draws: 0,
  divisionId: 'd1',
  psnId: 'cena_psn',
  mainOverall: 92,
  alignment: 'face' as const,
  recentForm: ['L', 'W'] as ('W' | 'L' | 'D')[],
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const divisions = [{ divisionId: 'd1', name: 'Raw', createdAt: '2024-01-01', updatedAt: '2024-01-01' }];

describe('PlayerHoverCard', () => {
  it('reveals the details left out of the table on hover', async () => {
    const user = userEvent.setup();
    render(<PlayerHoverCard player={player} divisions={divisions}><a href="/p">John Cena</a></PlayerHoverCard>);

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.hover(screen.getByRole('link'));

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Raw');
    expect(tooltip).toHaveTextContent('92');
    expect(tooltip).toHaveTextContent('cena_psn');
    expect(tooltip).toHaveTextContent('standings.alignment.face');
    // recentForm is newest first.
    expect(tooltip).toHaveTextContent('ui.formDots.loss');
  });

  it('opens on keyboard focus', async () => {
    const user = userEvent.setup();
    render(<PlayerHoverCard player={player} divisions={divisions}><a href="/p">John Cena</a></PlayerHoverCard>);

    await user.tab();

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });
});
