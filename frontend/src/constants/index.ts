/**
 * Application constants for consistent configuration across the frontend.
 */

/**
 * File upload size and type restrictions
 */
export const FILE_UPLOAD_LIMITS = {
  /** Maximum file size in bytes (5MB) */
  MAX_SIZE: 5 * 1024 * 1024,
  /** Maximum file size in megabytes for display */
  MAX_SIZE_MB: 5,
  /** Allowed MIME types for image uploads */
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const,
  /** File extensions hint for user display */
  ALLOWED_EXTENSIONS: 'JPEG, PNG, GIF, or WebP',
} as const;

/**
 * Form validation constraints
 */
export const VALIDATION = {
  /** Maximum length for name fields */
  MAX_NAME_LENGTH: 100,
  /** Maximum length for description fields */
  MAX_DESCRIPTION_LENGTH: 500,
  /** Minimum participants for a match */
  MIN_MATCH_PARTICIPANTS: 2,
  /** Minimum participants for a tournament */
  MIN_TOURNAMENT_PARTICIPANTS: 2,
} as const;

/**
 * API and request configuration
 */
export const API_CONFIG = {
  /** Default timeout for API requests in milliseconds */
  REQUEST_TIMEOUT: 30000,
  /** Retry delay in milliseconds */
  RETRY_DELAY: 1000,
  /** Maximum retry attempts */
  MAX_RETRIES: 3,
} as const;

/**
 * UI configuration
 */
export const UI_CONFIG = {
  /** Delay before hiding success messages (in milliseconds) */
  SUCCESS_MESSAGE_DURATION: 3000,
  /** Debounce delay for search inputs (in milliseconds) */
  SEARCH_DEBOUNCE: 300,
} as const;
