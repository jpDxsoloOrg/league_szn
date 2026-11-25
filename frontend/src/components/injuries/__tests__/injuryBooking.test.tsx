import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Player } from '../../../types';

/** Echoes the key and its values so tests can see what was filled in. */
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: string | Record<string, unknown>) => {
      if (typeof options === 'string') return options;
      if (!options || typeof options.defaultValue === 'string') return (options?.defaultValue as string) ?? key;
      const values = Object.entries(options).map(([name, value]) => `${name}=${String(value)}`).join(' ');
      return `${key}(${values})`;
    },
  }),
}));

vi.mock('../../events/PlayerBookingPicker.css', () => ({}));

import PlayerBookingPicker from '../../events/PlayerBookingPicker';
import InjuredParticipantsBanner from '../InjuredParticipantsBanner';
import ConditionReportTable from '../ConditionReportTable';
import { ApiError } from '../../../services/api/apiClient';
import { buildBookingCondition, injuryRefusalMessage, isPickBlocked } from '../../../utils/injuryBooking';

const DAY_MS = 24 * 60 * 60 * 1000;
const returnsAt = new Date(Date.now() + 10 * DAY_MS).toISOString();

function player(id: string, name: string, extra: Record<string, unknown> = {}): Player {
  return { playerId: id, name, currentWrestler: name, wins: 0, losses: 0, draws: 0, ...extra } as Player;
}

const players: Player[] = [
  player('fit', 'Fit Fred'),
  player('hurt', 'Hurt Harry', { currentInjury: { startedAt: '2024-01-01', returnsAt, severity: 'major', weeks: 4 } }),
  player('healed', 'Healed Hank', {
    currentInjury: { startedAt: '2024-01-01', returnsAt: '2024-02-01T00:00:00Z', severity: 'minor', weeks: 1 },
  }),
  player('tired', 'Tired Tom', { stamina: 12 }),
];

describe('buildBookingCondition', () => {
  it('is undefined while the injuries feature is off', () => {
    expect(buildBookingCondition(players, false, false)).toBeUndefined();
  });

  it('lists players injured now and low stamina, skipping injuries already over', () => {
    const condition = buildBookingCondition(players, true, false)!;
    expect([...condition.injuredUntil.keys()]).toEqual(['hurt']);
    expect([...condition.lowStamina.entries()]).toEqual([['tired', 12]]);
  });

  it('blocks only unselected injured players, and nobody once the override is on', () => {
    const condition = buildBookingCondition(players, true, false);
    expect(isPickBlocked(condition, 'hurt', false)).toBe(true);
    expect(isPickBlocked(condition, 'hurt', true)).toBe(false);
    expect(isPickBlocked(condition, 'fit', false)).toBe(false);
    expect(isPickBlocked(buildBookingCondition(players, true, true), 'hurt', false)).toBe(false);
  });
});

describe('injuryRefusalMessage', () => {
  const t = (key: string, options?: Record<string, unknown>) => `${key}:${String(options?.name ?? '')}`;

  it('translates a 409 PLAYER_INJURED with the player name', () => {
    const err = new ApiError('x', 409, { code: 'PLAYER_INJURED', body: { playerId: 'hurt', returnsAt } });
    expect(injuryRefusalMessage(err, t, () => 'Hurt Harry')).toBe('injuryReport.booking.refused:Hurt Harry');
  });

  it('ignores other errors', () => {
    expect(injuryRefusalMessage(new ApiError('x', 409, { code: 'SIGNUP_BLOCKED' }), t, () => 'A')).toBeNull();
    expect(injuryRefusalMessage(new Error('boom'), t, () => 'A')).toBeNull();
  });
});

describe('PlayerBookingPicker with an injury condition', () => {
  it('disables an injured player with a tag, and the override enables them', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PlayerBookingPicker players={players} value="" onChange={onChange} condition={buildBookingCondition(players, true, false)} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /open spot/i }));

    const hurt = screen.getByRole('option', { name: /Hurt Harry/ });
    expect(hurt).toBeDisabled();
    expect(hurt).toHaveTextContent('injuryReport.booking.injuredUntil');
    expect(screen.getByRole('option', { name: /Tired Tom/ })).toHaveTextContent('injuryReport.booking.stamina(stamina=12)');
    await userEvent.click(hurt);
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <PlayerBookingPicker players={players} value="" onChange={onChange} condition={buildBookingCondition(players, true, true)} />,
    );
    await userEvent.click(screen.getByRole('option', { name: /Hurt Harry/ }));
    expect(onChange).toHaveBeenCalledWith('hurt');
  });
});

describe('InjuredParticipantsBanner', () => {
  it('names each injured participant', () => {
    render(
      <InjuredParticipantsBanner
        injuredParticipants={[{ playerId: 'hurt', returnsAt }]}
        nameOf={() => 'Hurt Harry'}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('injuryReport.banner.text');
    expect(screen.getByRole('note')).toHaveTextContent('name=Hurt Harry');
  });

  it('renders nothing without injured participants', () => {
    const { container } = render(<InjuredParticipantsBanner injuredParticipants={undefined} nameOf={() => ''} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ConditionReportTable', () => {
  it('shows stamina, chance, roll and the outcome per participant', () => {
    render(
      <ConditionReportTable
        nameOf={(playerId) => (playerId === 'hurt' ? 'Hurt Harry' : 'Fit Fred')}
        report={[
          { playerId: 'fit', staminaBefore: 90, staminaAfter: 72, drain: 18, chance: 0.03, roll: 0.5 },
          {
            playerId: 'hurt', staminaBefore: 30, staminaAfter: 10, drain: 20, chance: 0.15, roll: 0.05,
            injuryId: 'i1', severity: 'major', weeks: 4, returnsAt,
          },
        ]}
      />,
    );
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Fit Fred');
    expect(rows[1]).toHaveTextContent('3.0%');
    expect(rows[1]).toHaveTextContent('0.500');
    expect(rows[1]).toHaveTextContent('injuryReport.condition.noInjury');
    expect(rows[2]).toHaveTextContent('injuryReport.condition.injured');
  });
});
