import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRunPayroll } = vi.hoisted(() => ({ mockRunPayroll: vi.fn() }));
vi.mock('../../../lib/economy/payroll', () => ({ runPayroll: mockRunPayroll }));

import { handler } from '../weeklyJobs';

describe('weeklyJobs handler (ECO-06)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockRunPayroll.mockReset();
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
});
