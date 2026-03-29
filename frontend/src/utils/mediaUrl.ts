/**
 * Convert an S3 URL to a same-origin path served via CloudFront.
 * CloudFront has cache behaviors that route S3 key prefixes (e.g. videos/*)
 * to the images bucket origin, so we just need the S3 object key as the path.
 *
 * Input:  https://wwe-2k-league-api-images-devtest.s3.amazonaws.com/videos/abc.mp4
 * Output: /videos/abc.mp4
 *
 * Falls back to the original URL if it doesn't match the expected S3 pattern.
 */
export function toMediaUrl(s3Url: string): string {
  try {
    const url = new URL(s3Url);
    // Match S3 URLs: {bucket}.s3.amazonaws.com or {bucket}.s3.{region}.amazonaws.com
    if (url.hostname.includes('.s3.') && url.hostname.endsWith('.amazonaws.com')) {
      return url.pathname; // e.g. /videos/abc.mp4
    }
  } catch {
    // Invalid URL, return as-is
  }
  return s3Url;
}
