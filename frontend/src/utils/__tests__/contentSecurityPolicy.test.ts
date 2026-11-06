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
});
