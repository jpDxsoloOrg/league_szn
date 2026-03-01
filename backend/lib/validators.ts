/**
 * Validators for different fields.
 */

export function validateBio(bio: unknown): string | null {
  if (typeof bio !== 'string') {
    return 'Bio must be a string';
  }
  if (bio.length > 255) {
    return 'Bio cannot exceed 255 characters';
  }
  return null;
}