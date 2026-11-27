/** Twitch login rule: 4-25 characters of [A-Za-z0-9_]. */
const TWITCH_CHANNEL_RE = /^[A-Za-z0-9_]{4,25}$/;

export function isTwitchChannel(channel: string): boolean {
  return TWITCH_CHANNEL_RE.test(channel);
}

export function twitchChannelUrl(channel: string): string {
  return `https://www.twitch.tv/${channel}`;
}

/**
 * Twitch refuses the embed unless `parent` names the embedding host, so the
 * current hostname covers prod, dev and localhost alike.
 */
export function twitchPlayerUrl(channel: string, parentHost: string): string {
  const params = new URLSearchParams({ channel, parent: parentHost, autoplay: 'true' });
  return `https://player.twitch.tv/?${params.toString()}`;
}
