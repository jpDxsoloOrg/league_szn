import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';
import {
  generateBreakingNewsHtml,
  generateMatchCardHtml,
  generateMediaPackageHtml,
  type BreakingNewsData,
  type MatchCardData,
  type MatchSlot,
  type MediaPackageData,
} from '../announcementHtml';

const card: MatchCardData = {
  showName: 'Fight Night',
  division: 'Raw',
  footerTagline: 'Now fight.',
  openingSceneSetting: 'The lights go out.',
  openingPromo: 'First line.\n\nSecond line.',
  gmName: 'GM JP',
};

const slot = (overrides: Partial<MatchSlot> = {}): MatchSlot => ({
  id: 'slot',
  badgeOverride: '',
  isMainEvent: false,
  extraBadge: '',
  participants: [
    { username: 'Alpha', wrestlerName: 'Edge' },
    { username: 'Beta', wrestlerName: '' },
  ],
  sceneSetting: '',
  promo: '',
  showPromo: false,
  ...overrides,
});

const news: BreakingNewsData = {
  headline: 'Suspended',
  dateText: 'May 1',
  subjectName: 'Alpha',
  subjectWrestler: 'Edge',
  tags: ['Banned'],
  newTag: '',
  bodyText: 'Paragraph one.\n\nParagraph two.',
  infoBoxTitle: 'Terms',
  infoBoxBody: 'Thirty days.',
  quote: 'No exceptions.',
  quoteAttribution: 'GM JP',
  footerTagline: '',
};

const media: MediaPackageData = {
  format: 'video',
  title: 'Promo Reel',
  subtitle: 'Part 1',
  dateText: 'May 1',
  mediaUrl: '/videos/reel.mp4',
  posterArtCredit: 'Alpha',
};

const allOutputs = (): string[] => [
  generateMatchCardHtml(card, [slot(), slot({ extraBadge: 'Title', promo: 'Words', sceneSetting: 'Scene' })]),
  generateBreakingNewsHtml(news),
  generateMediaPackageHtml(media),
  generateMediaPackageHtml({ ...media, format: 'poster' }),
];

describe('announcement HTML', () => {
  it('carries no inline styles or colour values', () => {
    for (const html of allOutputs()) {
      expect(html).not.toMatch(/style=/);
      expect(html).not.toMatch(/(?<!&)#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('keeps its class names through the sanitizer', () => {
    for (const html of allOutputs()) {
      expect(sanitizeHtml(html)).toContain('class="ann-doc"');
    }
  });

  it('escapes admin-entered text', () => {
    const html = generateMatchCardHtml({ ...card, showName: '<b>"x"</b>' }, [slot()]);

    expect(html).toContain('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  });

  it('bills the last match of several as the main event', () => {
    const html = generateMatchCardHtml(card, [slot(), slot()]);

    expect(html).toContain('Match 1');
    expect(html).toContain('Main Event');
    expect(html.match(/ann-doc__match--main/g)).toHaveLength(1);
  });

  it('honours a badge override and an explicit main event', () => {
    const html = generateMatchCardHtml(card, [slot({ isMainEvent: true, badgeOverride: 'Finale' })]);

    expect(html).toContain('Finale');
    expect(html).toContain('ann-doc__match--main');
  });

  it('rotates accents across the undercard', () => {
    const html = generateMatchCardHtml(card, [slot(), slot(), slot()]);

    expect(html).toContain('ann-doc__match--accent-0');
    expect(html).toContain('ann-doc__match--accent-1');
  });

  it('shows TBD for a match with no participants', () => {
    const html = generateMatchCardHtml(card, [slot({ participants: [{ username: ' ', wrestlerName: '' }] })]);

    expect(html).toContain('TBD');
  });

  it('keeps a playable video through the sanitizer', () => {
    const html = sanitizeHtml(generateMediaPackageHtml(media));

    expect(html).toContain('<video');
    expect(html).toContain('controls');
    expect(html).toContain('reel.mp4');
  });

  it('renders the poster with its credit', () => {
    const html = generateMediaPackageHtml({ ...media, format: 'poster', mediaUrl: 'https://cdn/x.png' });

    expect(html).toContain('<img');
    expect(html).toContain('alt="Promo Reel"');
    expect(html).toContain('Poster Art by Alpha');
  });
});
