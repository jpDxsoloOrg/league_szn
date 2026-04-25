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

  it('cycles to next champion when next arrow clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderCarousel();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('MJF & Kazuchika Okada');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Ricky Saints');
  });

  it('wraps around when going past the end', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderCarousel();

    // From idx 0 → click prev → wraps to last
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Ricky Saints');
  });

  it('jumps to a champion when its thumbnail is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderCarousel();

    const thumb = screen.getByRole('tab', {
      name: 'Mid Card Championship — Ricky Saints',
    });
    await user.click(thumb);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Ricky Saints');
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

  it('hides arrows and dots when only one champion is present', () => {
    render(
      <MemoryRouter>
        <ChampionCarousel champions={[champions[0]]} autoPlayInterval={0} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
  });

  it('responds to keyboard arrow keys', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderCarousel();

    const region = screen.getByRole('region');
    region.focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('MJF & Kazuchika Okada');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Swerve Strickland');
  });
});
