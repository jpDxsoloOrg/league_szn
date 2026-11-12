import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Player } from '../../../types';
import type { ContenderWithPlayer, ContenderWithTagTeam } from '../../../types/contender';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'contenders.score': 'Score',
        'contenders.winRate': 'Win %',
        'contenders.streak': 'Streak',
        'contenders.topContender': '#1 Contender',
        'contenders.tagTeam.dissolved': 'Dissolved',
        'standings.table.division': 'Division',
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock('../ContenderCard.css', () => ({}));
vi.mock('../ContenderMembers.css', () => ({}));
vi.mock('../../PlayerHoverCard.css', () => ({}));

import ContenderCard from '../ContenderCard';

const baseStats = {
  championshipId: 'tag-title',
  rankingScore: 81.25,
  winPercentage: 75,
  currentStreak: 3,
  qualityScore: 70,
  recencyScore: 80,
  matchesInPeriod: 8,
  winsInPeriod: 6,
  peakRank: 1,
  weeksAtTop: 2,
  calculatedAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  movement: 2,
  isNew: false,
};

const singlesContender: ContenderWithPlayer = {
  ...baseStats,
  championshipId: 'world',
  playerId: 'p1',
  playerName: 'John Cena',
  wrestlerName: 'The Champ',
  imageUrl: null,
  rank: 1,
};

const tagContender: ContenderWithTagTeam = {
  ...baseStats,
  entityType: 'tagTeam',
  playerId: 'tt1',
  tagTeamId: 'tt1',
  tagTeamName: 'The Usos',
  tagTeamImageUrl: null,
  tagTeamStatus: 'active',
  members: [
    { playerId: 'p2', playerName: 'Jey', wrestlerName: 'Jey Uso', imageUrl: null },
    { playerId: 'p3', playerName: 'Jimmy', wrestlerName: 'Jimmy Uso', imageUrl: null },
  ],
  // Back-compat fallbacks the tag card must not use.
  playerName: 'Jey & Jimmy',
  wrestlerName: 'FALLBACK NAME',
  imageUrl: null,
  rank: 2,
  currentStreak: -2,
  movement: -1,
};

const jey: Player = {
  playerId: 'p2',
  name: 'Jey',
  currentWrestler: 'Jey Uso',
  wins: 10,
  losses: 2,
  draws: 0,
  divisionId: 'raw',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

function renderCard(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <ol>{ui}</ol>
    </MemoryRouter>,
  );
}

describe('ContenderCard', () => {
  it('renders a singles contender with wrestler, player and stats', () => {
    renderCard(<ContenderCard contender={singlesContender} />);

    expect(screen.getByRole('heading', { name: 'The Champ' })).toBeInTheDocument();
    expect(screen.getByText('John Cena')).toBeInTheDocument();
    expect(screen.getByText('#1 Contender')).toBeInTheDocument();
    expect(screen.getByText('81.3')).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
    expect(screen.getByText('W3')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('.contender-duo')).toBeNull();
  });

  it('renders a tag team with the team name linking to the team page', () => {
    renderCard(<ContenderCard contender={tagContender} />);

    const teamLink = screen.getByRole('link', { name: 'The Usos' });
    expect(teamLink).toHaveAttribute('href', '/tag-teams/tt1');
    expect(screen.getByRole('heading', { name: 'The Usos' })).toBeInTheDocument();
    expect(screen.queryByText('FALLBACK NAME')).not.toBeInTheDocument();

    const subtitle = document.querySelector('.contender-row__player');
    expect(subtitle).toHaveTextContent('Jey & Jimmy');

    // Both portraits, overlapping in one duo.
    const duo = document.querySelector('.contender-duo');
    expect(duo).not.toBeNull();
    expect(within(duo as HTMLElement).getByRole('img', { name: 'Jey Uso' })).toBeInTheDocument();
    expect(within(duo as HTMLElement).getByRole('img', { name: 'Jimmy Uso' })).toBeInTheDocument();

    // Same stat chips as singles.
    expect(screen.getByText('81.3')).toBeInTheDocument();
    expect(screen.getByText('L2')).toBeInTheDocument();
    expect(document.querySelector('.contender-row__move--down')).toHaveTextContent('1');
  });

  it('links known members to their profile and shows the hover card', async () => {
    const user = userEvent.setup();
    renderCard(
      <ContenderCard
        contender={tagContender}
        memberLookup={{
          playersById: new Map([[jey.playerId, jey]]),
          divisions: [{ divisionId: 'raw', name: 'Raw', createdAt: '', updatedAt: '' }],
        }}
      />,
    );

    const jeyLink = screen.getByRole('link', { name: 'Jey' });
    expect(jeyLink).toHaveAttribute('href', '/player/p2');
    // Jimmy has no player row loaded, so he is plain text.
    expect(screen.queryByRole('link', { name: 'Jimmy' })).not.toBeInTheDocument();

    await user.hover(jeyLink);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Raw');
  });

  it('flags a dissolved team', () => {
    renderCard(<ContenderCard contender={{ ...tagContender, tagTeamStatus: 'dissolved' as const }} />);
    expect(screen.getByText('Dissolved')).toBeInTheDocument();
  });
});
