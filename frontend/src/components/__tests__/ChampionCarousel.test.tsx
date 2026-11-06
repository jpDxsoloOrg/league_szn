import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { DashboardChampion } from '../../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOptions?: string | { count?: number }) => {
      const map: Record<string, string> = {
        'dashboard.noChampions': 'No active champions',
        'dashboard.champions': 'Current Champions',
      };
      if (map[key]) return map[key];
      if (typeof fallbackOrOptions === 'string') return fallbackOrOptions;
      return fallbackOrOptions?.count === undefined ? key : `${key}:${fallbackOrOptions.count}`;
    },
  }),
}));

vi.mock('../ChampionCarousel.css', () => ({}));

import ChampionCarousel from '../ChampionCarousel';

const champions: DashboardChampion[] = [
  {
    championshipId: 'c2',
    championshipName: 'Tag Team Championship',
    championName: 'MJF & Kazuchika Okada',
    playerId: 'p2',
    wonDate: '2026-03-01',
    defenses: 2,
  },
  {
    championshipId: 'c1',
    championshipName: 'World Heavyweight Championship',
    championName: 'Swerve Strickland',
    championImageUrl: 'https://example.com/swerve.png',
    playerId: 'p1',
    wonDate: '2026-04-24',
    defenses: 0,
  },
  {
    championshipId: 'c3',
    championshipName: 'Mid Card Championship',
    championName: 'Ricky Saints',
    playerId: 'p3',
  },
];

function renderCarousel(list: DashboardChampion[] = champions) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<ChampionCarousel champions={list} />} />
        <Route path="/championships" element={<p>Titles page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function tileFor(name: string): HTMLElement {
  return screen.getByRole('link', { name: new RegExp(name) });
}

describe('ChampionCarousel', () => {
  beforeAll(() => {
    // Embla measures with these, which jsdom does not provide.
    class ObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ObserverStub);
    vi.stubGlobal('IntersectionObserver', ObserverStub);
  });

  it('shows a linked tile for every champion, world title first', () => {
    renderCarousel();
    const tiles = screen.getAllByRole('link').filter((link) => link.classList.contains('ui-tile'));
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toHaveTextContent('Swerve Strickland');
    tiles.forEach((tile) => expect(tile).toHaveAttribute('href', '/championships'));
  });

  it('gives each title its rim colour', () => {
    renderCarousel();
    expect(tileFor('Swerve Strickland')).toHaveClass('ui-tile--world');
    expect(tileFor('Okada')).toHaveClass('ui-tile--tag');
    expect(tileFor('Ricky Saints').className).toMatch(/ui-tile--(us|ic|tag)/);
  });

  it('does not treat a word containing "us" as the US title', () => {
    const list = [
      { championshipId: 'c8', championshipName: 'Tag Belt', championName: 'Pair', playerId: 'p8' },
      { championshipId: 'c9', championshipName: 'Prestigious Belt', championName: 'Other', playerId: 'p9' },
    ];
    renderCarousel(list);
    // Second slot in the rotation; a false US match would give ui-tile--us.
    expect(tileFor('Other')).toHaveClass('ui-tile--ic');
  });

  it('shows reign length and defenses only when the data exists', () => {
    renderCarousel();
    expect(tileFor('Okada')).toHaveTextContent('home.defenses:2');
    expect(tileFor('Ricky Saints')).not.toHaveTextContent('home.reignDays');
  });

  it('uses the champion photo when there is one', () => {
    renderCarousel();
    const image = tileFor('Swerve Strickland').querySelector('img');
    expect(image).toHaveAttribute('src', 'https://example.com/swerve.png');
    expect(tileFor('Ricky Saints').querySelector('img')).toBeNull();
  });

  it('renders an empty state that leads to the titles page', async () => {
    renderCarousel([]);
    expect(screen.getByText('No active champions')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View championships' }));
    expect(screen.getByText('Titles page')).toBeInTheDocument();
  });
});
