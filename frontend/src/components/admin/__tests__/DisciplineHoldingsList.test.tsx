import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../i18n/locales/en.json';
import type { DisciplineHoldings } from '../../../types';
import DisciplineHoldingsList from '../DisciplineHoldingsList';

const lookup = (path: string): string =>
  path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], en) as string;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: Record<string, string> | string) => {
      if (key.startsWith('matchFormats.')) return typeof options === 'string' ? options : key;
      return lookup(key).replace(/\{\{(\w+)\}\}/g, (_match, name: string) => (options as Record<string, string>)[name]);
    },
  }),
}));

type MatchHolding = DisciplineHoldings['matches'][number];

const holding = (fields: Partial<MatchHolding>): MatchHolding => ({
  matchId: 'm1',
  date: '2026-12-20',
  status: 'scheduled',
  opponents: [],
  eventId: 'e1',
  ...fields,
});

const renderMatches = (matches: MatchHolding[]) => render(
  <MemoryRouter>
    <DisciplineHoldingsList
      holdings={{ titles: [], matches, challenges: [], tournaments: [] }}
      onNavigate={vi.fn()}
    />
  </MemoryRouter>,
);

describe('DisciplineHoldingsList', () => {
  it('tells apart several matches on one card', () => {
    renderMatches([
      holding({ matchId: 'm1', matchFormat: 'singles', opponents: ['Rock'] }),
      holding({ matchId: 'm2', matchFormat: 'triple-threat', opponents: ['Rock', 'Cena'] }),
    ]);

    expect(screen.getByRole('link', { name: 'Singles vs Rock on Dec 20, 2026' })).toHaveAttribute('href', '/events/e1');
    expect(screen.getByRole('link', { name: 'Triple Threat vs Rock, Cena on Dec 20, 2026' })).toBeInTheDocument();
  });

  it('gives the match type while the other spots are open', () => {
    renderMatches([holding({ matchFormat: 'Tag Team' })]);

    expect(screen.getByRole('link', { name: 'Tag Team on Dec 20, 2026' })).toBeInTheDocument();
  });

  it('still reads as a match with no stored type', () => {
    renderMatches([holding({ opponents: ['Rock'] }), holding({ matchId: 'm2' })]);

    expect(screen.getByRole('link', { name: 'Match vs Rock on Dec 20, 2026' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Match on Dec 20, 2026' })).toBeInTheDocument();
  });
});
