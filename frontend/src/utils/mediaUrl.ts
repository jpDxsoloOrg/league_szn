/**
 * Convert an S3 video/image URL to a same-origin /media/ path served via CloudFront.
 * This avoids CORS issues when embedding videos in <video> elements.
 *
 * Input:  https://wwe-2k-league-api-images-devtest.s3.amazonaws.com/videos/abc.mp4
 * Output: /media/videos/abc.mp4
 *
 * Falls back to the original URL if it doesn't match the expected S3 pattern.
 */
export function toMediaUrl(s3Url: string): string {
  try {
    const url = new URL(s3Url);
    // Match S3 URLs: {bucket}.s3.amazonaws.com or {bucket}.s3.{region}.amazonaws.com
    if (url.hostname.includes('.s3.') && url.hostname.endsWith('.amazonaws.com')) {
      // pathname starts with / — e.g. /videos/abc.mp4
      return `/media${url.pathname}`;
    }
  } catch {
    // Invalid URL, return as-is
  }
  return s3Url;
}
