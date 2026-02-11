/**
 * Input sanitization utilities for form inputs.
 * Helps prevent XSS attacks and ensures data integrity.
 */

/**
 * Sanitizes a string input by trimming whitespace, limiting length,
 * and removing potentially dangerous HTML characters.
 *
 * @param input - The input string to sanitize
 * @param maxLength - Maximum allowed length (default: 100)
 * @returns The sanitized string
 */
export const sanitizeInput = (input: string, maxLength: number = 100): string => {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, ''); // Remove angle brackets to prevent HTML injection
};

/**
 * Sanitizes a name field (player name, championship name, etc.)
 * Allows alphanumeric characters, spaces, hyphens, apostrophes, and periods.
 *
 * @param name - The name to sanitize
 * @param maxLength - Maximum allowed length (default: 100)
 * @returns The sanitized name
 */
export const sanitizeName = (name: string, maxLength: number = 100): string => {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name
    .trim()
    .slice(0, maxLength)
    .replace(/[^a-zA-Z0-9\s\-'.]/g, ''); // Only allow alphanumeric, spaces, hyphens, apostrophes, periods
};

/**
 * Sanitizes a description or longer text field.
 *
 * @param text - The text to sanitize
 * @param maxLength - Maximum allowed length (default: 500)
 * @returns The sanitized text
 */
export const sanitizeDescription = (text: string, maxLength: number = 500): string => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '');
};

/**
 * Validates that a string is not empty after sanitization.
 *
 * @param input - The input to validate
 * @returns True if the input is a non-empty string after trimming
 */
export const isValidInput = (input: string): boolean => {
  return typeof input === 'string' && input.trim().length > 0;
};

/**
 * Validates that a string meets minimum length requirements.
 *
 * @param input - The input to validate
 * @param minLength - Minimum required length
 * @returns True if the input meets the minimum length
 */
export const meetsMinLength = (input: string, minLength: number): boolean => {
  return typeof input === 'string' && input.trim().length >= minLength;
};
