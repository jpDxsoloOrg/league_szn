import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRunPayroll, mockGetInjuryTunables } = vi.hoisted(() => ({
  mockRunPayroll: vi.fn(),
  mockGetInjuryTunables: vi.fn(),
}));
vi.mock('../../../lib/economy/payroll', () => ({ runPayroll: mockRunPayroll }));
// INJ-01: the league time zone comes from the injury tunables.
vi.mock('../../../lib/repositories', () => ({
  getRepositories: () => ({ user: { siteConfig: { getInjuryTunables: mockGetInjuryTunables } } }),
}));

import { handler } from '../weeklyJobs';

describe('weeklyJobs handler (ECO-06)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockRunPayroll.mockReset();
    mockGetInjuryTunables.mockReset();
    mockGetInjuryTunables.mockResolvedValue({ timezone: 'America/New_York' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs payroll for the current league week', async () => {
    vi.setSystemTime(new Date('2026-11-22T05:05:00.000Z'));
    mockRunPayroll.mockResolvedValue({ status: 'paid' });

    const result = await handler();

    expect(result).toEqual({ weekKey: '2026-11-22', jobs: { payroll: 'paid' } });
    expect(mockRunPayroll).toHaveBeenCalledWith(expect.any(Date), expect.objectContaining({ weekKey: '2026-11-22' }));
  });

  it('warns when a missed Sunday runs late', async () => {
    vi.setSystemTime(new Date('2026-11-24T15:00:00.000Z'));
    mockRunPayroll.mockResolvedValue({ status: 'paid' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await handler();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ran late'));
  });

  it('reports a failing job without throwing', async () => {
    vi.setSystemTime(new Date('2026-11-22T05:05:00.000Z'));
    mockRunPayroll.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await handler();

    expect(result.jobs.payroll).toBe('error');
  });

  // INJ-01
  it('uses the league time zone from site config', async () => {
    // Sunday 2026-11-22 00:30 in Tokyo, still Saturday in New York.
    vi.setSystemTime(new Date('2026-11-21T15:30:00.000Z'));
    mockGetInjuryTunables.mockResolvedValue({ timezone: 'Asia/Tokyo' });
    mockRunPayroll.mockResolvedValue({ status: 'paid' });

    const result = await handler();

    expect(result.weekKey).toBe('2026-11-22');
    const week = mockRunPayroll.mock.calls[0][1];
    expect(week.isSunday).toBe(true);
    expect(week.weekStart.toISOString()).toBe('2026-11-21T15:00:00.000Z');
  });

  it('stays on the New York week by default', async () => {
    vi.setSystemTime(new Date('2026-11-21T15:30:00.000Z'));
    mockRunPayroll.mockResolvedValue({ status: 'alreadyRun' });

    expect((await handler()).weekKey).toBe('2026-11-15');
  });

  it('falls back to America/New_York when site config cannot be read', async () => {
    vi.setSystemTime(new Date('2026-11-22T05:05:00.000Z'));
    mockGetInjuryTunables.mockRejectedValue(new Error('dynamo down'));
    mockRunPayroll.mockResolvedValue({ status: 'paid' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await handler();

    expect(result).toEqual({ weekKey: '2026-11-22', jobs: { payroll: 'paid' } });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('America/New_York'), expect.any(Error));
  });
});
