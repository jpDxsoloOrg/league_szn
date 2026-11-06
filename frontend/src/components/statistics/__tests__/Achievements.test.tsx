import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

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

function renderComponent(entry = '/stats/achievements') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Achievements />
    </MemoryRouter>
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
      expect(document.querySelector('.ach-card-earned')).toBeTruthy();
    });

    // All achievement defs rendered
    expect(screen.getByText('First Blood')).toBeInTheDocument();
    expect(screen.getByText('Grand Slam')).toBeInTheDocument();
    expect(screen.getByText('Streak Master')).toBeInTheDocument();

    // The API stamps earnedAt at request time, so no date is displayed
    expect(document.querySelector('.ach-card-earned')).toHaveTextContent('First Blood');
    expect(screen.queryByText(/2024-03-15/)).not.toBeInTheDocument();

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
      expect(document.querySelector('.ach-card-earned')).toBeTruthy();
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

  it('opens on the player named in the URL', async () => {
    mockGetAchievements.mockResolvedValue({
      players: mockPlayers,
      allAchievements: allAchievementDefs,
      achievements: playerAchievements,
    });

    renderComponent(`/stats/achievements?player=${mockPlayers[1]!.playerId}`);

    await waitFor(() => {
      expect(mockGetAchievements).toHaveBeenCalledWith(mockPlayers[1]!.playerId, expect.any(AbortSignal));
    });
  });

  it('does not show everything as locked when the earned list fails to load', async () => {
    mockGetAchievements
      .mockResolvedValueOnce({ players: mockPlayers, allAchievements: allAchievementDefs })
      .mockRejectedValueOnce(new Error('Network error'));

    renderComponent();

    expect(await screen.findByRole('button', { name: 'common.retry' })).toBeInTheDocument();
    expect(screen.queryByText('Locked')).not.toBeInTheDocument();
  });

  it('shows loading state while fetching data', async () => {
    mockGetAchievements.mockReturnValue(new Promise(() => {}));

    renderComponent();

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
