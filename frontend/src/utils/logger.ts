/**
 * Logger utility for development-only logging.
 * Prevents sensitive data from being logged in production.
 */

const isDevelopment = import.meta.env.DEV;

type LogArgs = unknown[];

export const logger = {
  /**
   * Log informational messages (development only)
   */
  info: (message: string, ...args: LogArgs): void => {
    if (isDevelopment) {
      console.log(`[INFO] ${message}`, ...args);
    }
  },

  /**
   * Log warning messages (development only)
   */
  warn: (message: string, ...args: LogArgs): void => {
    if (isDevelopment) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  },

  /**
   * Log error messages (always logged for debugging critical issues)
   * Note: Avoid including sensitive data in error logs
   */
  error: (message: string, ...args: LogArgs): void => {
    // Errors are always logged but we strip any potentially sensitive objects in production
    if (isDevelopment) {
      console.error(`[ERROR] ${message}`, ...args);
    } else {
      // In production, only log the message without potentially sensitive data
      console.error(`[ERROR] ${message}`);
    }
  },

  /**
   * Log debug messages (development only)
   */
  debug: (message: string, ...args: LogArgs): void => {
    if (isDevelopment) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  },
};

export default logger;
