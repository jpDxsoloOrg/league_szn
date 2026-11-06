import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../deferShellRequest');

import { SHELL_REQUEST_DELAY_MS, waitForPageRequests } from '../deferShellRequest';

describe('waitForPageRequests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds until the delay has passed', async () => {
    const done = vi.fn();
    void waitForPageRequests(new AbortController().signal).then(done);

    await vi.advanceTimersByTimeAsync(SHELL_REQUEST_DELAY_MS - 1);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it('lets go at once when aborted', async () => {
    const controller = new AbortController();
    const done = vi.fn();
    void waitForPageRequests(controller.signal).then(done);

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalled();
  });
});
