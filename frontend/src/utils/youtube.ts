/** Same rule as the backend `YOUTUBE_ID_RE`: 11 characters of [A-Za-z0-9_-]. */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Render guard: every YouTube URL is built from a validated id, never from stored text. */
export function isYoutubeId(id: string): boolean {
  return YOUTUBE_ID_RE.test(id);
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Privacy-enhanced player. Autoplay only runs after the viewer clicked the facade. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
}

/** `hqdefault` exists for every video, so this never 404s. */
export function youtubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}
