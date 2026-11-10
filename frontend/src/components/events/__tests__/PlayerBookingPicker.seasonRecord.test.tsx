import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../../i18n/locales/en.json';
import de from '../../../i18n/locales/de.json';
import type { Player, PlayerBookingInfo } from '../../../types';
import PlayerBookingPicker from '../PlayerBookingPicker';

// Real translations here (not a stub t) so the pluralised label is checked.
vi.mock('../PlayerBookingPicker.css', () => ({}));

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en }, de: { translation: de } },
    interpolation: { escapeValue: false },
  });
});

function player(id: string, wrestler: string): Player {
  return { playerId: id, name: id, currentWrestler: wrestler, wins: 0, losses: 0, draws: 0 } as Player;
}

const players = [player('p1', 'Alpha'), player('p2', 'Bravo'), player('p3', 'Charlie')];

function info(seasonRecord?: PlayerBookingInfo['seasonRecord']): PlayerBookingInfo {
  return {
    lastBookedAt: null,
    currentStreak: { type: 'L', count: 4 },
    ...(seasonRecord ? { seasonRecord } : {}),
  };
}

const season = (wins: number, losses: number, draws: number) => ({
  seasonId: 's4', seasonName: 'Season 4', wins, losses, draws,
});

async function openPicker(booking: Map<string, PlayerBookingInfo>) {
  render(
    <PlayerBookingPicker players={players} value="" onChange={vi.fn()} bookingInfoByPlayerId={booking} />,
  );
  await userEvent.click(screen.getByRole('button'));
  return (wrestler: string) => screen.getAllByRole('option').find((o) => o.textContent?.includes(wrestler))!;
}

describe('PlayerBookingPicker season record', () => {
  it('shows a W-L-D chip before the streak with a pluralised label', async () => {
    await i18next.changeLanguage('en');
    const row = await openPicker(new Map([
      ['p1', info(season(5, 3, 1))],
      ['p2', info(season(1, 1, 2))],
    ]));

    const chip = within(row('Alpha')).getByRole('img', { name: 'Season 4: 5 wins, 3 losses, 1 draw' });
    expect(chip).toHaveTextContent('5-3-1');
    expect(chip).toHaveAttribute('title', 'Season 4: 5 wins, 3 losses, 1 draw');
    expect(chip.className).not.toContain('booking-picker-record--empty');
    // Record comes first in the meta, then the streak badge.
    const streak = within(row('Alpha')).getByText('L4');
    expect(chip.compareDocumentPosition(streak) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(within(row('Bravo')).getByRole('img', { name: 'Season 4: 1 win, 1 loss, 2 draws' })).toHaveTextContent('1-1-2');
  });

  it('shows 0-0-0 muted rather than hiding it', async () => {
    await i18next.changeLanguage('en');
    const row = await openPicker(new Map([['p1', info(season(0, 0, 0))]]));
    const chip = within(row('Alpha')).getByRole('img', { name: 'Season 4: 0 wins, 0 losses, 0 draws' });
    expect(chip).toHaveTextContent('0-0-0');
    expect(chip.className).toContain('booking-picker-record--empty');
  });

  it('has no chip when the summary carries no season record', async () => {
    await i18next.changeLanguage('en');
    const row = await openPicker(new Map([['p1', info()]]));
    expect(within(row('Alpha')).queryByRole('img')).not.toBeInTheDocument();
    expect(within(row('Alpha')).getByText('L4')).toBeInTheDocument();
  });

  it('labels the record in German', async () => {
    await i18next.changeLanguage('de');
    const row = await openPicker(new Map([['p1', info(season(1, 2, 1))]]));
    expect(within(row('Alpha')).getByRole('img', {
      name: 'Season 4: 1 Sieg, 2 Niederlagen, 1 Unentschieden',
    })).toBeInTheDocument();
  });
});
