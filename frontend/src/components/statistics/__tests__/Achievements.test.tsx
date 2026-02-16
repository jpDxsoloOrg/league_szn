import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';

// --- Hoisted mocks ---
const { mockGetAchievements } = vi.hoisted(() => ({
  mockGetAchievements: vi.fn(),
}));

vi.mock('../../../services/api', () => ({
  statisticsApi: { getAchievements: mockGetAchievements },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'statistics.achievements.title': 'Achievements',
        'statistics.achievements.earned': 'earned',
        'statistics.achievements.earnedOn': 'Earned on',
        'statistics.achievements.locked': 'Locked',
        'statistics.achievements.noAchievements': 'No achievements available.',
        'statistics.achievements.filters.all': 'All',
        'statistics.achievements.filters.milestones': 'Milestones',
        'statistics.achievements.filters.records': 'Records',
        'statistics.achievements.filters.special': 'Special',
        'statistics.playerStats.selectPlayer': 'Select Player',
        'statistics.nav.playerStats': 'Player Stats',
        'statistics.nav.records': 'Records',
        'statistics.nav.leaderboards': 'Leaderboards',
        'common.loading': 'Loading...',
      };
      return map[key] || key;
    },
  }),
}));

vi.mock('../Achievements.css', () => ({}));

import Achievements from '../Achievements';

// --- Test data ---
const mockPlayers = [
  { playerId: 'p1', name: 'John Cena', wrestlerName: 'The Champ' },
  { playerId: 'p2', name: 'The Rock', wrestlerName: 'The Great One' },
];

const allAchievementDefs = [
  {
    achievementId: 'ach1',
    achievementName: 'First Blood',
    achievementType: 'milestone' as const,
    description: 'Win your first match',
    icon: 'sword',
  },
  {
    achievementId: 'ach2',
    achievementName: 'Grand Slam',
    achievementType: 'special' as const,
    description: 'Win every championship',
    icon: 'trophy',
  },
  {
    achievementId: 'ach3',
    achievementName: 'Streak Master',
    achievementType: 'record' as const,
    description: 'Win 10 matches in a row',
    icon: 'fire',
  },
];

const playerAchievements = [
  {
    ...allAchievementDefs[0],
    playerId: 'p1',
    earnedAt: '2024-03-15',
  },
];

function renderComponent() {
  return render(
    <BrowserRouter>
      <Achievements />
    </BrowserRouter>
  );
}

describe('Achievements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders achievement badges with earned/locked status and progress bar', async () => {
    // First call: load initial data (no playerId)
    mockGetAchievements.mockResolvedValueOnce({
      players: mockPlayers,
      allAchievements: allAchievementDefs,
    });
    // Second call: load player achievements (with playerId)
    mockGetAchievements.mockResolvedValueOnce({
      players: mockPlayers,
      allAchievements: allAchievementDefs,
      achievements: playerAchievements,
    });

    renderComponent();

    // Wait for player achievements to load (second API call)
    await waitFor(() => {
      expect(document.querySelector('.ach-earned-date')).toBeTruthy();
    });

    // All achievement defs rendered
    expect(screen.getByText('First Blood')).toBeInTheDocument();
    expect(screen.getByText('Grand Slam')).toBeInTheDocument();
    expect(screen.getByText('Streak Master')).toBeInTheDocument();

    // Earned achievement shows date
    const earnedDate = document.querySelector('.ach-earned-date');
    expect(earnedDate).toHaveTextContent('Earned on 2024-03-15');

    // Locked achievements show "Locked" label
    const lockedLabels = screen.getAllByText('Locked');
    expect(lockedLabels).toHaveLength(2); // Grand Slam and Streak Master

    // Progress bar summary: 1/3 earned
    expect(screen.getByText('1/3 earned')).toBeInTheDocument();
  });

  it('filters achievements by category when filter buttons are clicked', async () => {
    const user = userEvent.setup();

    mockGetAchievements.mockResolvedValueOnce({
      players: mockPlayers,
      allAchievements: allAchievementDefs,
    });
    mockGetAchievements.mockResolvedValueOnce({
      players: mockPlayers,
      allAchievements: allAchievementDefs,
      achievements: playerAchievements,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
    });

    // Click Milestones filter
    await user.click(screen.getByText('Milestones'));

    // Only milestone achievements visible
    await waitFor(() => {
      expect(screen.getByText('First Blood')).toBeInTheDocument();
    });
    expect(screen.queryByText('Grand Slam')).not.toBeInTheDocument();
    expect(screen.queryByText('Streak Master')).not.toBeInTheDocument();

    // Progress updates: 1/1 for milestones
    expect(screen.getByText('1/1 earned')).toBeInTheDocument();
  });

  it('shows loading state while fetching data', async () => {
    mockGetAchievements.mockReturnValue(new Promise(() => {}));

    renderComponent();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
