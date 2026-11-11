import { toMediaUrl } from '../../utils/mediaUrl';

/**
 * Announcement bodies are stored as HTML and rendered inside the announcement
 * Modal. They carry class names only: the look lives in announcementContent.css,
 * so a stored announcement follows the theme instead of baking in its colours.
 */

export type MediaFormat = 'video' | 'poster';

export interface Participant {
  username: string;
  wrestlerName: string;
}

export interface MatchSlot {
  id: string;
  badgeOverride: string;
  isMainEvent: boolean;
  extraBadge: string;
  participants: Participant[];
  sceneSetting: string;
  promo: string;
  showPromo: boolean;
}

export interface MatchCardData {
  showName: string;
  division: string;
  footerTagline: string;
  openingSceneSetting: string;
  openingPromo: string;
  gmName: string;
}

export interface BreakingNewsData {
  headline: string;
  dateText: string;
  subjectName: string;
  subjectWrestler: string;
  tags: string[];
  newTag: string;
  bodyText: string;
  infoBoxTitle: string;
  infoBoxBody: string;
  quote: string;
  quoteAttribution: string;
  footerTagline: string;
}

export interface MediaPackageData {
  format: MediaFormat;
  title: string;
  subtitle: string;
  dateText: string;
  mediaUrl: string;
  posterArtCredit: string;
}

/** Undercard matches rotate through this many accent classes. */
const MATCH_ACCENT_COUNT = 5;

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphs(text: string, className: string): string {
  return text
    .trim()
    .split('\n\n')
    .map((para) => `<p class="${className}">${esc(para.trim())}</p>`)
    .join('\n');
}

function renderParticipantsHtml(participants: Participant[]): string {
  const filled = participants.filter((p) => p.username.trim());
  if (filled.length === 0) return '<span class="ann-doc__tbd">TBD</span>';

  return filled
    .map((p, i) => {
      const name = `<span class="ann-doc__fighter">${esc(p.username)}</span>`;
      const wrestler = p.wrestlerName.trim()
        ? `<span class="ann-doc__fighter-wrestler">(${esc(p.wrestlerName)})</span>`
        : '';
      const vs = i < filled.length - 1 ? '<span class="ann-doc__vs">VS</span>' : '';
      return `${name}${wrestler}${vs}`;
    })
    .join('\n');
}

function renderPromoHtml(sceneSetting: string, promo: string): string {
  const scene = sceneSetting.trim()
    ? `<p class="ann-doc__scene">${esc(sceneSetting.trim())}</p>\n`
    : '';
  const speech = promo.trim() ? `${paragraphs(promo, 'ann-doc__text')}\n` : '';
  return `${scene}${speech}`;
}

function renderBanner(label: string, tone: 'alert' | 'official'): string {
  return `
<div class="ann-doc__banner-row">
  <span class="ann-doc__banner ann-doc__banner--${tone}">&#9888; ${label} &#9888;</span>
</div>`;
}

function renderHeader(eyebrow: string, title: string, subtitle: string, dateText: string): string {
  return `
<header class="ann-doc__header">
  <div class="ann-doc__eyebrow">${eyebrow}</div>
  <h1 class="ann-doc__title">${esc(title)}</h1>
  ${subtitle.trim() ? `<div class="ann-doc__subtitle">${esc(subtitle)}</div>` : ''}
  ${dateText.trim() ? `<div class="ann-doc__meta">${esc(dateText)}</div>` : ''}
</header>`;
}

function renderSignoff(text: string): string {
  return `<p class="ann-doc__signoff">${text}</p>`;
}

export function generateMatchCardHtml(data: MatchCardData, matches: MatchSlot[]): string {
  const header = renderHeader('League SZN Presents', data.showName || "Tonight's Card", data.division, '');

  const openingScene = data.openingSceneSetting.trim()
    ? `\n<p class="ann-doc__scene">${esc(data.openingSceneSetting.trim())}</p>`
    : '';

  const openingPromo = data.openingPromo.trim()
    ? `\n<blockquote class="ann-doc__quote">
  ${paragraphs(data.openingPromo, 'ann-doc__text')}
  ${data.gmName.trim() ? `<p class="ann-doc__attribution">- ${esc(data.gmName)}</p>` : ''}
</blockquote>`
    : '';

  let accentIndex = 0;
  const matchesHtml = matches
    .map((match, index) => {
      const isMain = match.isMainEvent || (index === matches.length - 1 && matches.length > 1);
      const badgeLabel = match.badgeOverride.trim() || (isMain ? 'Main Event' : `Match ${index + 1}`);
      const toneClass = isMain
        ? 'ann-doc__match--main'
        : `ann-doc__match--accent-${accentIndex++ % MATCH_ACCENT_COUNT}`;
      const extraBadge = match.extraBadge.trim()
        ? `<span class="ann-doc__badge">${esc(match.extraBadge)}</span>`
        : '';
      const promoHtml = renderPromoHtml(match.sceneSetting, match.promo);

      return `
<section class="ann-doc__match ${toneClass}">
  <div class="ann-doc__badges">
    <span class="ann-doc__badge ann-doc__badge--lead">${esc(badgeLabel)}</span>
    ${extraBadge}
  </div>
  <div class="ann-doc__fighters">
    ${renderParticipantsHtml(match.participants)}
  </div>
  ${promoHtml}
</section>`;
    })
    .join('\n');

  const footer = `
<footer class="ann-doc__footer">
  <p class="ann-doc__tagline">${esc(data.footerTagline || 'The GM has spoken. Now fight.')}</p>
  ${renderSignoff(`Tonight's Card &mdash; Signed, Sealed &amp; Sanctioned by ${esc(data.gmName || 'GM JP')}`)}
</footer>`;

  return `<article class="ann-doc">${header}${openingScene}${openingPromo}${matchesHtml}${footer}
</article>`;
}

export function generateBreakingNewsHtml(data: BreakingNewsData): string {
  const banner = renderBanner('BREAKING NEWS', 'alert');
  const header = renderHeader('League SZN Official Statement', data.headline, '', data.dateText);

  const tagsHtml = data.tags.length
    ? `<div class="ann-doc__tags">
      ${data.tags.map((tag) => `<span class="ann-doc__tag">${esc(tag)}</span>`).join('\n      ')}
    </div>`
    : '';

  const subjectSection =
    data.subjectName.trim() || data.subjectWrestler.trim()
      ? `<div class="ann-doc__subject">
  ${data.subjectName.trim() ? `<span class="ann-doc__subject-name">${esc(data.subjectName)}</span>` : ''}
  ${data.subjectWrestler.trim() ? `<span class="ann-doc__fighter-wrestler">(${esc(data.subjectWrestler)})</span>` : ''}
  ${tagsHtml}
</div>`
      : '';

  const bodyHtml = data.bodyText.trim() ? paragraphs(data.bodyText, 'ann-doc__text') : '';

  const infoBox =
    data.infoBoxTitle.trim() || data.infoBoxBody.trim()
      ? `<aside class="ann-doc__info">
  ${data.infoBoxTitle.trim() ? `<div class="ann-doc__info-title">&#128683; ${esc(data.infoBoxTitle)}</div>` : ''}
  ${data.infoBoxBody.trim() ? `<p class="ann-doc__text">${esc(data.infoBoxBody)}</p>` : ''}
</aside>`
      : '';

  const quoteSection = data.quote.trim()
    ? `<blockquote class="ann-doc__quote">
  <p class="ann-doc__text">&ldquo;${esc(data.quote.trim())}&rdquo;</p>
  ${data.quoteAttribution.trim() ? `<p class="ann-doc__attribution">&#8212; ${esc(data.quoteAttribution)}</p>` : ''}
</blockquote>`
    : '';

  const footer = `
<footer class="ann-doc__footer">
  <p class="ann-doc__tagline">${esc(data.footerTagline || 'Zero tolerance. No exceptions.')}</p>
  ${renderSignoff('League SZN Official &mdash; Office of the General Manager')}
</footer>`;

  return `<article class="ann-doc">${banner}${header}
${subjectSection}${bodyHtml}${infoBox}${quoteSection}${footer}
</article>`;
}

export function generateMediaPackageHtml(data: MediaPackageData): string {
  if (data.format === 'video') {
    const banner = renderBanner('Video Package', 'alert');
    const header = renderHeader('League SZN Exclusive', data.title, '', data.dateText);
    const videoSrc = toMediaUrl(data.mediaUrl.trim());

    const videoBox = `
<video class="ann-doc__media" width="100%" controls playsinline preload="metadata">
  <source src="${esc(videoSrc)}">
</video>`;

    const footer = `
<footer class="ann-doc__footer">
  ${renderSignoff('League SZN Official &mdash; Office of the General Manager')}
</footer>`;

    return `<article class="ann-doc">${banner}${header}${videoBox}${footer}
</article>`;
  }

  // Poster format
  const banner = renderBanner('OFFICIAL ANNOUNCEMENT', 'official');
  const header = renderHeader('League SZN Official Statement', data.title, data.subtitle, data.dateText);

  const imageSrc = data.mediaUrl.trim();
  const imageAlt = data.title.trim() || 'Poster';

  const imageBlock = `
<img class="ann-doc__media" src="${esc(imageSrc)}" alt="${esc(imageAlt)}">`;

  const credit = data.posterArtCredit.trim()
    ? `<p class="ann-doc__tagline">Poster Art by ${esc(data.posterArtCredit)}</p>`
    : '';

  const footer = `
<footer class="ann-doc__footer">
  ${credit}
  ${renderSignoff('League SZN Official | Office of the Commissioner')}
</footer>`;

  return `<article class="ann-doc">${banner}${header}${imageBlock}${footer}
</article>`;
}
