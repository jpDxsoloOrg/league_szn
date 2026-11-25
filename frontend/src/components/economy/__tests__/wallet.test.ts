import { describe, it, expect } from 'vitest';
import type { OwnLedgerEntry } from '../../../services/api/contracts.api';
import { formatMoney, nextPayday, startOfWeek, timeLeft, weekEarnings } from '../wallet';

function entry(kind: OwnLedgerEntry['kind'], amount: number, createdAt: Date): OwnLedgerEntry {
  return {
    playerId: 'p1',
    entryId: `${kind}-${createdAt.getTime()}`,
    createdAt: createdAt.toISOString(),
    sortKey: '',
    kind,
    amount,
    balanceAfter: 0,
  };
}

// Wednesday 25 November 2026, 15:00 local time.
const WEDNESDAY = new Date(2026, 10, 25, 15, 0, 0);

describe('wallet helpers', () => {
  it('starts the league week on Sunday at midnight, like payroll', () => {
    expect(startOfWeek(WEDNESDAY)).toEqual(new Date(2026, 10, 22));
    expect(startOfWeek(new Date(2026, 10, 29, 9))).toEqual(new Date(2026, 10, 29));
    expect(startOfWeek(new Date(2026, 10, 28, 23))).toEqual(new Date(2026, 10, 22));
  });

  it('pays on the coming Sunday, or today when it is Sunday', () => {
    expect(nextPayday(WEDNESDAY)).toEqual(new Date(2026, 10, 29));
    expect(nextPayday(new Date(2026, 10, 29, 23))).toEqual(new Date(2026, 10, 29));
    expect(nextPayday(new Date(2026, 10, 30))).toEqual(new Date(2026, 11, 6));
  });

  it('counts pay, bonuses and salary from this week only', () => {
    const entries = [
      entry('perMatchPay', 100, new Date(2026, 10, 25, 10)),
      entry('winBonus', 40, new Date(2026, 10, 24, 10)),
      entry('fine', -50, new Date(2026, 10, 24, 9)),
      entry('purchase', -30, new Date(2026, 10, 23, 9)),
      entry('salary', 200, new Date(2026, 10, 23, 0, 30)),
      entry('salary', 200, new Date(2026, 10, 22, 12)),
      entry('salary', 200, new Date(2026, 10, 21, 12)),
    ];

    // Since Sunday 22 Nov: 100 + 40 + 200 + 200; Saturday's salary is last week.
    expect(weekEarnings(entries, WEDNESDAY)).toBe(540);
  });

  it('formats money with the symbol and a sign', () => {
    expect(formatMoney(1200, '$', 'en')).toBe('$1,200');
    expect(formatMoney(-40, '$', 'en')).toBe('-$40');
    expect(formatMoney(40, '$', 'en', true)).toBe('+$40');
    expect(formatMoney(0, '', 'en', true)).toBe('0');
  });

  it('reports the time left on an offer', () => {
    const now = new Date('2026-11-26T12:00:00.000Z');
    expect(timeLeft('2026-11-29T13:00:00.000Z', now)).toEqual({ unit: 'days', count: 3 });
    expect(timeLeft('2026-11-26T17:30:00.000Z', now)).toEqual({ unit: 'hours', count: 6 });
    expect(timeLeft('2026-11-26T12:00:30.000Z', now)).toEqual({ unit: 'hours', count: 1 });
    expect(timeLeft('2026-11-26T11:00:00.000Z', now)).toEqual({ unit: 'expired' });
  });
});
