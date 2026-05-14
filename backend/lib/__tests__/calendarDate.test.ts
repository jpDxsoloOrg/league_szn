import { describe, it, expect } from 'vitest';
import { normalizeCalendarDate } from '../calendarDate';

describe('normalizeCalendarDate', () => {
  it('passes through YYYY-MM-DD unchanged', () => {
    expect(normalizeCalendarDate('2026-05-17')).toBe('2026-05-17');
  });

  it('strips the time portion of a full ISO timestamp', () => {
    // Storing the UTC date portion gives identical display in every viewer
    // timezone — the original cause of the EST/UK day-shift bug.
    expect(normalizeCalendarDate('2026-05-18T00:00:00.000Z')).toBe('2026-05-18');
    expect(normalizeCalendarDate('2026-05-15T04:00:00.000Z')).toBe('2026-05-15');
  });

  it('returns null for malformed input', () => {
    expect(normalizeCalendarDate('not-a-date')).toBeNull();
    expect(normalizeCalendarDate('')).toBeNull();
    expect(normalizeCalendarDate(undefined)).toBeNull();
    expect(normalizeCalendarDate(123)).toBeNull();
    expect(normalizeCalendarDate('2026-13-01')).toBeNull();
    expect(normalizeCalendarDate('2026-01-32')).toBeNull();
  });
});
