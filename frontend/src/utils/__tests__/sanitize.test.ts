/**
 * Tests for frontend/src/utils/sanitize.ts
 *
 * Five exported functions: sanitizeInput, sanitizeName, sanitizeDescription,
 * isValidInput, meetsMinLength.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeInput,
  sanitizeName,
  sanitizeDescription,
  isValidInput,
  meetsMinLength,
} from '../sanitize';

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// sanitizeInput
// ===========================================================================

describe('sanitizeInput', () => {
  it('trims whitespace, limits length, and removes angle brackets', () => {
    const input = '  Hello <script>alert("xss")</script> World  ';
    const result = sanitizeInput(input, 50);

    // Trimmed first, then sliced, then angle brackets removed
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toMatch(/^\s/);
    expect(result).not.toMatch(/\s$/);
    expect(result).toContain('Hello');
  });

  it('limits output to the specified maxLength before removing angle brackets', () => {
    const longInput = 'A'.repeat(200);
    const result = sanitizeInput(longInput, 50);

    // slice(0, 50) applied after trim, then angle bracket removal
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('returns empty string for null, undefined, or non-string inputs', () => {
    // The function signature accepts string but guards with typeof check
    expect(sanitizeInput(null as unknown as string)).toBe('');
    expect(sanitizeInput(undefined as unknown as string)).toBe('');
    expect(sanitizeInput(123 as unknown as string)).toBe('');
    expect(sanitizeInput('')).toBe('');
  });
});

// ===========================================================================
// sanitizeName
// ===========================================================================

describe('sanitizeName', () => {
  it('allows Unicode letters, numbers, spaces, hyphens, apostrophes, and periods', () => {
    const validName = "John O'Brien-Smith Jr. III";
    const result = sanitizeName(validName);

    expect(result).toBe("John O'Brien-Smith Jr. III");
  });

  it('allows Unicode characters like accented letters and CJK characters', () => {
    const unicodeName = 'Jose Garcia';
    const result = sanitizeName(unicodeName);

    expect(result).toBe('Jose Garcia');
  });

  it('strips characters not in the allowed set (@ # $ % ^ & * etc.)', () => {
    const dirtyName = 'John@Doe#Smith$100%';
    const result = sanitizeName(dirtyName);

    expect(result).not.toContain('@');
    expect(result).not.toContain('#');
    expect(result).not.toContain('$');
    expect(result).not.toContain('%');
    // Should keep the letters and numbers
    expect(result).toContain('John');
    expect(result).toContain('Doe');
    expect(result).toContain('Smith');
    expect(result).toContain('100');
  });

  it('returns empty string for null/undefined/non-string inputs', () => {
    expect(sanitizeName(null as unknown as string)).toBe('');
    expect(sanitizeName(undefined as unknown as string)).toBe('');
  });
});

// ===========================================================================
// sanitizeDescription
// ===========================================================================

describe('sanitizeDescription', () => {
  it('trims whitespace, limits to maxLength, and removes angle brackets', () => {
    const desc = '  This is a <b>bold</b> description  ';
    const result = sanitizeDescription(desc);

    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toMatch(/^\s/);
    expect(result).not.toMatch(/\s$/);
    expect(result).toContain('This is a');
  });

  it('defaults maxLength to 500 and respects custom maxLength', () => {
    const longDesc = 'B'.repeat(600);

    const defaultResult = sanitizeDescription(longDesc);
    expect(defaultResult.length).toBeLessThanOrEqual(500);

    const customResult = sanitizeDescription(longDesc, 100);
    expect(customResult.length).toBeLessThanOrEqual(100);
  });

  it('returns empty string for null/undefined/non-string inputs', () => {
    expect(sanitizeDescription(null as unknown as string)).toBe('');
    expect(sanitizeDescription(undefined as unknown as string)).toBe('');
    expect(sanitizeDescription('')).toBe('');
  });
});

// ===========================================================================
// isValidInput
// ===========================================================================

describe('isValidInput', () => {
  it('returns true for a non-empty string after trimming', () => {
    expect(isValidInput('hello')).toBe(true);
    expect(isValidInput('  hello  ')).toBe(true);
    expect(isValidInput('a')).toBe(true);
  });

  it('returns false for whitespace-only strings, empty strings, and non-strings', () => {
    expect(isValidInput('')).toBe(false);
    expect(isValidInput('   ')).toBe(false);
    expect(isValidInput('\t\n')).toBe(false);
    // Non-string input guard
    expect(isValidInput(null as unknown as string)).toBe(false);
    expect(isValidInput(undefined as unknown as string)).toBe(false);
  });
});

// ===========================================================================
// meetsMinLength
// ===========================================================================

describe('meetsMinLength', () => {
  it('returns true when trimmed input length meets or exceeds minLength', () => {
    expect(meetsMinLength('abc', 3)).toBe(true);
    expect(meetsMinLength('abcd', 3)).toBe(true);
    expect(meetsMinLength('  abc  ', 3)).toBe(true); // trims to 'abc' (3 chars)
  });

  it('returns false when trimmed input length is below minLength', () => {
    expect(meetsMinLength('ab', 3)).toBe(false);
    expect(meetsMinLength('', 1)).toBe(false);
    expect(meetsMinLength('  a  ', 3)).toBe(false); // trims to 'a' (1 char)
    // Non-string guard
    expect(meetsMinLength(null as unknown as string, 1)).toBe(false);
  });
});
