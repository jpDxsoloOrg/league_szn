/**
 * Tests for frontend/src/utils/logger.ts
 *
 * The logger checks `import.meta.env.DEV` at module load time to set
 * `isDevelopment`. Because this is captured as a top-level const, we
 * must reset modules between environment switches so the const is
 * re-evaluated with the new value.
 *
 * Strategy:
 * - Use vi.stubEnv to control import.meta.env.DEV
 * - Use dynamic import with vi.resetModules() to force re-evaluation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ===========================================================================
// Development mode (import.meta.env.DEV = true)
// ===========================================================================

describe('logger in development mode', () => {
  it('info, warn, and debug all write to their respective console methods', async () => {
    vi.stubEnv('DEV', true as unknown as string);
    vi.resetModules();

    const { logger } = await import('../logger');

    logger.info('test info', { extra: 1 });
    logger.warn('test warn', 42);
    logger.debug('test debug');

    expect(console.log).toHaveBeenCalledWith('[INFO] test info', { extra: 1 });
    expect(console.warn).toHaveBeenCalledWith('[WARN] test warn', 42);
    expect(console.debug).toHaveBeenCalledWith('[DEBUG] test debug');
  });

  it('error logs the message AND extra args in development mode', async () => {
    vi.stubEnv('DEV', true as unknown as string);
    vi.resetModules();

    const { logger } = await import('../logger');

    const errorObj = new Error('boom');
    logger.error('something failed', errorObj);

    expect(console.error).toHaveBeenCalledWith(
      '[ERROR] something failed',
      errorObj,
    );
  });
});

// ===========================================================================
// Production mode (import.meta.env.DEV = false)
// ===========================================================================

describe('logger in production mode', () => {
  it('info, warn, and debug do NOT write to console', async () => {
    vi.stubEnv('DEV', false as unknown as string);
    vi.resetModules();

    const { logger } = await import('../logger');

    logger.info('should not appear');
    logger.warn('should not appear');
    logger.debug('should not appear');

    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.debug).not.toHaveBeenCalled();
  });

  it('error logs only the message string without extra args (sanitized)', async () => {
    vi.stubEnv('DEV', false as unknown as string);
    vi.resetModules();

    const { logger } = await import('../logger');

    const sensitiveData = { password: 'secret123', token: 'jwt-abc' };
    logger.error('auth failed', sensitiveData);

    // Should be called with ONLY the formatted message, not the sensitive data
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('[ERROR] auth failed');
  });
});
