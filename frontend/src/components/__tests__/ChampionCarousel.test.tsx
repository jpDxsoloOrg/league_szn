import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardChampion } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const map: Record<string, string> = {
        'dashboard.noChampions': 'No active champions',
      };
      return map[key] ?? fallback ?? key;
    },
  }),
}));

vi.mock('../ChampionCarousel.css', () => ({}));

import ChampionCarousel from '../ChampionCarousel';

const champions: DashboardChampion[] = [
  {
    championshipId: 'c1',
    championshipName: 'World Heavyweight Championship',
    championName: 'Swerve Strickland',
    playerId: 'p1',
    wonDate: '2026-04-24',
    defenses: 0,
  },
  {
    championshipId: 'c2',
    championshipName: 'Tag Team Championship',
    championName: 'MJF & Kazuchika Okada',
    playerId: 'p2',
    wonDate: '2026-03-01',
    defenses: 2,
  },
  {
    championshipId: 'c3',
    championshipName: 'Mid Card Championship',
    championName: 'Ricky Saints',
    playerId: 'p3',
    wonDate: '2026-04-01',
    defenses: 1,
  },
];

function renderCarousel(props: Partial<React.ComponentProps<typeof ChampionCarousel>> = {}) {
  return render(
    <MemoryRouter>
      <ChampionCarousel champions={champions} autoPlayInterval={0} {...props} />
    </MemoryRouter>
  );
}

describe('ChampionCarousel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts on the World Heavyweight champion when present', () => {
    renderCarousel();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Swerve Strickland');
  });

  it('excludes the currently featured champion from the right-side strip', () => {
    renderCarousel();
    // Swerve is featured (heading), so he should NOT be in the right strip buttons.
    const buttons = screen.queryAllByRole('button');
    const labels = buttons.map((b) => b.getAttribute('aria-label'));
    expect(labels).not.toContain('World Heavyweight Championship — Swerve Strickland');
    expect(labels).toContain('Tag Team Championship — MJF & Kazuchika Okada');
    expect(labels).toContain('Mid Card Championship — Ricky Saints');
  });

  it('switches to a champion when their right-side row is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderCarousel();

    await user.click(
      screen.getByRole('button', { name: 'Mid Card Championship — Ricky Saints' })
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Ricky Saints');
    // The newly featured champion is now removed from the strip
    expect(
      screen.queryByRole('button', { name: 'Mid Card Championship — Ricky Saints' })
    ).not.toBeInTheDocument();
  });

  it('auto-advances at the given interval', () => {
    renderCarousel({ autoPlayInterval: 1000 });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Swerve Strickland');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('MJF & Kazuchika Okada');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Ricky Saints');
  });

  it('renders empty state when no champions', () => {
    render(
      <MemoryRouter>
        <ChampionCarousel champions={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText('No active champions')).toBeInTheDocument();
  });

  it('hides the right-side strip when only one champion is present', () => {
    render(
      <MemoryRouter>
        <ChampionCarousel champions={[champions[0]]} autoPlayInterval={0} />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Swerve Strickland');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
