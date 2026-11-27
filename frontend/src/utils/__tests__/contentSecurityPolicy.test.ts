import { describe, it, expect } from 'vitest';
import indexHtml from '../../../index.html?raw';

function directive(name: string): string[] {
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(indexHtml)?.[1] ?? '';
  const match = policy.split(';').map((entry) => entry.trim().split(/\s+/)).find(([key]) => key === name);
  return match?.slice(1) ?? [];
}

describe('Content-Security-Policy in index.html', () => {
  it('lets stored announcement videos load from the league media buckets only', () => {
    expect(directive('media-src')).toEqual([
      "'self'",
      'https://wwe-2k-league-api-images-dev.s3.amazonaws.com',
      'https://wwe-2k-league-api-images-devtest.s3.amazonaws.com',
    ]);
  });

  it('frames only the YouTube nocookie player and the Twitch player', () => {
    expect(directive('frame-src')).toEqual([
      'https://www.youtube-nocookie.com',
      'https://player.twitch.tv',
    ]);
  });

  it('loads YouTube thumbnails from i.ytimg.com', () => {
    expect(directive('img-src')).toContain('https://i.ytimg.com');
  });

  it('adds no script or connect sources for the embeds', () => {
    expect(directive('script-src')).toEqual(["'self'"]);
    expect(directive('connect-src').some((source) => /youtube|twitch|ytimg/.test(source))).toBe(false);
  });
});
