/**
 * YouTube helpers for Episodes. Episodes store only the 11-character video
 * id; every URL (watch, embed, thumbnail) is built from it.
 */

export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com']);
const PATH_ID_PREFIXES = new Set(['shorts', 'embed', 'live', 'v']);

const matchId = (candidate: string | null | undefined): string | null =>
  candidate && YOUTUBE_ID_RE.test(candidate) ? candidate : null;

/**
 * The video id from a YouTube link or a bare id, or null for anything that
 * is not a single YouTube video (other hosts, playlists, channels).
 */
export function parseYoutubeVideoId(input: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);

  if (YOUTUBE_HOSTS.has(host)) {
    if (segments.length === 1 && segments[0] === 'watch') return matchId(url.searchParams.get('v'));
    if (segments.length >= 2 && PATH_ID_PREFIXES.has(segments[0])) return matchId(segments[1]);
    return null;
  }
  if (host === 'youtu.be') return matchId(segments[0]);
  return null;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function youtubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export interface YoutubeOEmbed {
  title: string;
  channelName?: string;
}

const DEFAULT_OEMBED_TIMEOUT_MS = 4000;

/**
 * Title and channel from YouTube's oEmbed endpoint (no API key). Returns null
 * on any failure: not found, private or embedding disabled (401/403), network
 * error, timeout, or an unexpected body. Never throws.
 */
export async function fetchYoutubeOEmbed(
  id: string,
  timeoutMs: number = DEFAULT_OEMBED_TIMEOUT_MS,
): Promise<YoutubeOEmbed | null> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeWatchUrl(id))}&format=json`;
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      console.warn(`YouTube oEmbed returned ${response.status} for ${id}`);
      return null;
    }
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) {
      console.warn(`YouTube oEmbed returned an unexpected body for ${id}`);
      return null;
    }
    const { title, author_name: authorName } = body as Record<string, unknown>;
    if (typeof title !== 'string' || title.trim().length === 0) {
      console.warn(`YouTube oEmbed returned no title for ${id}`);
      return null;
    }
    const result: YoutubeOEmbed = { title: title.trim() };
    if (typeof authorName === 'string' && authorName.trim().length > 0) {
      result.channelName = authorName.trim();
    }
    return result;
  } catch (err) {
    console.warn(`YouTube oEmbed failed for ${id}:`, err);
    return null;
  }
}
