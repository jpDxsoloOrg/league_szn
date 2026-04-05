import { useState } from 'react';
import { announcementsApi } from '../../services/api';
import './AnnouncementWizard.css';

interface AnnouncementWizardProps {
  onClose: () => void;
  onPublished: () => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardMode = 'select' | 'match-card' | 'breaking-news';

interface Participant {
  username: string;
  wrestlerName: string;
}

interface MatchSlot {
  id: string;
  badgeOverride: string;
  isMainEvent: boolean;
  extraBadge: string;
  participants: Participant[];
  sceneSetting: string;
  promo: string;
  showPromo: boolean;
}

interface MatchCardData {
  showName: string;
  division: string;
  footerTagline: string;
  openingSceneSetting: string;
  openingPromo: string;
  gmName: string;
}

interface BreakingNewsData {
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

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_MATCH_CARD: MatchCardData = {
  showName: "Tonight's Card",
  division: '',
  footerTagline: 'The GM has spoken. Now fight.',
  openingSceneSetting: '',
  openingPromo: '',
  gmName: 'GM JP',
};

const DEFAULT_BREAKING_NEWS: BreakingNewsData = {
  headline: '',
  dateText: new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }),
  subjectName: '',
  subjectWrestler: '',
  tags: [],
  newTag: '',
  bodyText: '',
  infoBoxTitle: '',
  infoBoxBody: '',
  quote: '',
  quoteAttribution: 'GM JP',
  footerTagline: 'Zero tolerance. No exceptions.',
};

function newMatch(): MatchSlot {
  return {
    id: crypto.randomUUID(),
    badgeOverride: '',
    isMainEvent: false,
    extraBadge: '',
    participants: [
      { username: '', wrestlerName: '' },
      { username: '', wrestlerName: '' },
    ],
    sceneSetting: '',
    promo: '',
    showPromo: false,
  };
}

// ─── HTML Generation ─────────────────────────────────────────────────────────

const MATCH_PALETTE = [
  {
    border: 'rgba(212, 175, 55, 0.15)',
    bg: 'linear-gradient(135deg, rgba(212, 175, 55, 0.06), rgba(192, 57, 43, 0.04))',
    badgeBg: 'rgba(212, 175, 55, 0.15)',
    badgeBorder: 'rgba(212, 175, 55, 0.3)',
    badgeColor: '#d4af37',
    nameColor: '#f5e6a3',
    insetBorder: 'rgba(212, 175, 55, 0.08)',
  },
  {
    border: 'rgba(192, 57, 43, 0.15)',
    bg: 'linear-gradient(135deg, rgba(192, 57, 43, 0.06), rgba(142, 68, 173, 0.04))',
    badgeBg: 'rgba(192, 57, 43, 0.15)',
    badgeBorder: 'rgba(192, 57, 43, 0.3)',
    badgeColor: '#e74c3c',
    nameColor: '#e8a09a',
    insetBorder: 'rgba(192, 57, 43, 0.08)',
  },
  {
    border: 'rgba(142, 68, 173, 0.15)',
    bg: 'linear-gradient(135deg, rgba(142, 68, 173, 0.06), rgba(52, 152, 219, 0.04))',
    badgeBg: 'rgba(142, 68, 173, 0.15)',
    badgeBorder: 'rgba(142, 68, 173, 0.3)',
    badgeColor: '#af7ac5',
    nameColor: '#d2b4de',
    insetBorder: 'rgba(142, 68, 173, 0.08)',
  },
  {
    border: 'rgba(39, 174, 96, 0.15)',
    bg: 'linear-gradient(135deg, rgba(39, 174, 96, 0.06), rgba(212, 175, 55, 0.04))',
    badgeBg: 'rgba(39, 174, 96, 0.15)',
    badgeBorder: 'rgba(39, 174, 96, 0.3)',
    badgeColor: '#2ecc71',
    nameColor: '#a9dfbf',
    insetBorder: 'rgba(39, 174, 96, 0.08)',
  },
  {
    border: 'rgba(52, 152, 219, 0.15)',
    bg: 'linear-gradient(135deg, rgba(52, 152, 219, 0.06), rgba(142, 68, 173, 0.04))',
    badgeBg: 'rgba(52, 152, 219, 0.15)',
    badgeBorder: 'rgba(52, 152, 219, 0.3)',
    badgeColor: '#3498db',
    nameColor: '#aed6f1',
    insetBorder: 'rgba(52, 152, 219, 0.08)',
  },
];

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderParticipantsHtml(participants: Participant[], nameColor: string): string {
  const filled = participants.filter((p) => p.username.trim());
  if (filled.length === 0) return '<span style="color:#666;">TBD</span>';

  return filled
    .map((p, i) => {
      const name = `<span style="font-size: 22px; font-weight: bold; color: ${nameColor}; text-transform: uppercase; letter-spacing: 2px; display: block;">${esc(p.username)}</span>`;
      const wrestler = p.wrestlerName.trim()
        ? `<span style="font-size: 12px; color: #888; display: block;">(${esc(p.wrestlerName)})</span>`
        : '';
      const vs =
        i < filled.length - 1
          ? `<span style="font-size: 16px; color: #c0392b; margin: 4px 0; display: inline-block; font-weight: bold;">VS</span>`
          : '';
      return `${name}${wrestler}${vs}`;
    })
    .join('\n');
}

function renderPromoHtml(sceneSetting: string, promo: string): string {
  if (!sceneSetting.trim() && !promo.trim()) return '';
  let html = '';
  if (sceneSetting.trim()) {
    html += `<p style="font-size: 13px; line-height: 1.7; color: #999; margin: 0; font-style: italic;">${esc(sceneSetting.trim())}</p>\n`;
  }
  if (promo.trim()) {
    promo
      .trim()
      .split('\n\n')
      .forEach((para, i) => {
        const margin = i === 0 && sceneSetting.trim() ? '8px 0 0 0' : '12px 0 0 0';
        html += `<p style="font-size: 14px; line-height: 1.8; color: #ccc; margin: ${margin};">${esc(para.trim())}</p>\n`;
      });
  }
  return html;
}

function generateMatchCardHtml(data: MatchCardData, matches: MatchSlot[]): string {
  const header = `
<div style="text-align: center; padding-bottom: 24px; margin-bottom: 24px; background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.08), transparent); border-bottom: 1px solid rgba(212, 175, 55, 0.2);">
  <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 5px; color: #d4af37; margin-bottom: 12px;">League SZN Presents</div>
  <h1 style="margin: 0; font-size: 30px; text-transform: uppercase; letter-spacing: 3px; background: linear-gradient(135deg, #d4af37, #f5e6a3, #d4af37); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${esc(data.showName || "Tonight's Card")}</h1>
  ${data.division.trim() ? `<div style="font-size: 13px; color: #999; margin-top: 8px; letter-spacing: 1.5px; text-transform: uppercase;">${esc(data.division)}</div>` : ''}
  <div style="width: 60px; height: 2px; background: linear-gradient(90deg, #d4af37, #c0392b); margin: 14px auto 0; border-radius: 2px;"></div>
</div>`;

  const openingScene = data.openingSceneSetting.trim()
    ? `\n<div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 3px solid rgba(212, 175, 55, 0.3);">
  <p style="font-size: 13px; line-height: 1.8; color: #888; margin: 0; font-style: italic;">${esc(data.openingSceneSetting.trim())}</p>
</div>`
    : '';

  const openingPromo = data.openingPromo.trim()
    ? `\n<div style="background: linear-gradient(135deg, rgba(212, 175, 55, 0.08), rgba(212, 175, 55, 0.02)); border-left: 3px solid #d4af37; border-radius: 0 10px 10px 0; padding: 20px; margin-bottom: 24px;">
  ${data.openingPromo
    .trim()
    .split('\n\n')
    .map(
      (para, i) =>
        `<p style="font-size: 15px; line-height: 1.9; color: #ccc; margin: ${i === 0 ? '0' : '12px 0 0 0'};">${esc(para.trim())}</p>`
    )
    .join('\n  ')}
  ${data.gmName.trim() ? `<p style="text-align: right; color: #d4af37; font-size: 13px; margin: 10px 0 0 0; font-weight: bold;">- ${esc(data.gmName)}</p>` : ''}
</div>`
    : '';

  let colorIndex = 0;
  const matchesHtml = matches
    .map((match, index) => {
      const autoLabel =
        match.isMainEvent || (index === matches.length - 1 && matches.length > 1)
          ? 'Main Event'
          : `Match ${index + 1}`;
      const badgeLabel = match.badgeOverride.trim() || autoLabel;
      const isMain = match.isMainEvent || (index === matches.length - 1 && matches.length > 1);

      if (isMain) {
        const participantsHtml = renderParticipantsHtml(match.participants, '#f5e6a3');
        const promoHtml = renderPromoHtml(match.sceneSetting, match.promo);
        const extraBadge = match.extraBadge.trim()
          ? `<span style="background: rgba(212, 175, 55, 0.15); border: 1px solid rgba(212, 175, 55, 0.3); color: #d4af37; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${esc(match.extraBadge)}</span>`
          : '';
        const promoBox = promoHtml
          ? `\n  <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 16px; margin-bottom: 14px;">\n  ${promoHtml}  </div>`
          : '';

        return `
<div style="background: linear-gradient(135deg, rgba(192, 57, 43, 0.1), rgba(212, 175, 55, 0.1), rgba(192, 57, 43, 0.1)); border: 2px solid rgba(192, 57, 43, 0.3); border-radius: 10px; padding: 22px; margin-top: 16px; box-shadow: 0 6px 30px rgba(192, 57, 43, 0.15), inset 0 1px 0 rgba(212, 175, 55, 0.1);">
  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
    <span style="background: linear-gradient(135deg, #c0392b, #8e1a1a); color: #fff; padding: 4px 14px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">${esc(badgeLabel)}</span>
    ${extraBadge}
  </div>
  <div style="text-align: center; margin-bottom: 14px;">
    ${participantsHtml}
  </div>${promoBox}
</div>`;
      } else {
        const palette = MATCH_PALETTE[colorIndex % MATCH_PALETTE.length]!;
        colorIndex++;
        const participantsHtml = renderParticipantsHtml(match.participants, palette.nameColor);
        const promoHtml = renderPromoHtml(match.sceneSetting, match.promo);
        const extraBadge = match.extraBadge.trim()
          ? `<span style="background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.2); color: #d4af37; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${esc(match.extraBadge)}</span>`
          : '';

        return `
<div style="background: ${palette.bg}; border: 1px solid ${palette.border}; border-radius: 10px; padding: 22px; margin-top: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 ${palette.insetBorder};">
  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
    <span style="background: ${palette.badgeBg}; border: 1px solid ${palette.badgeBorder}; color: ${palette.badgeColor}; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${esc(badgeLabel)}</span>
    ${extraBadge}
  </div>
  <div style="text-align: center; margin-bottom: 12px;">
    ${participantsHtml}
  </div>
  ${promoHtml}
</div>`;
      }
    })
    .join('\n');

  const footer = `
<div style="text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06);">
  <p style="font-size: 18px; font-weight: bold; text-transform: uppercase; letter-spacing: 3px; margin: 0; background: linear-gradient(135deg, #d4af37, #c0392b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${esc(data.footerTagline || 'The GM has spoken. Now fight.')}</p>
  <p style="color: #555; font-size: 11px; margin-top: 14px; letter-spacing: 1px; text-transform: uppercase;">Tonight's Card &mdash; Signed, Sealed &amp; Sanctioned by ${esc(data.gmName || 'GM JP')}</p>
</div>`;

  return `<div style="font-family: 'Segoe UI', Arial, sans-serif; color: #e8e8e8; max-width: 620px; margin: 0 auto; background: linear-gradient(180deg, #0d0d0d 0%, #1a1018 50%, #0d0d0d 100%); border-radius: 12px; padding: 32px; border: 1px solid rgba(212, 175, 55, 0.15);">${header}${openingScene}${openingPromo}${matchesHtml}${footer}
</div>`;
}

function generateBreakingNewsHtml(data: BreakingNewsData): string {
  const banner = `
<div style="text-align: center; margin-bottom: 20px;">
  <span style="background: linear-gradient(135deg, #c0392b, #8e1a1a); color: #fff; padding: 6px 24px; border-radius: 4px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; display: inline-block;">&#9888; BREAKING NEWS &#9888;</span>
</div>`;

  const header = `
<div style="text-align: center; padding-bottom: 24px; margin-bottom: 24px; border-bottom: 1px solid rgba(192, 57, 43, 0.2);">
  <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 5px; color: #c0392b; margin-bottom: 12px;">League SZN Official Statement</div>
  <h1 style="margin: 0; font-size: 26px; text-transform: uppercase; letter-spacing: 2px; color: #fff; line-height: 1.3;">${esc(data.headline)}</h1>
  ${data.dateText.trim() ? `<div style="font-size: 13px; color: #999; margin-top: 12px; letter-spacing: 1.5px; text-transform: uppercase;">${esc(data.dateText)}</div>` : ''}
  <div style="width: 60px; height: 2px; background: linear-gradient(90deg, #c0392b, #d4af37); margin: 14px auto 0; border-radius: 2px;"></div>
</div>`;

  const tagsHtml = data.tags.length
    ? `<div style="margin-top: 12px; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
      ${data.tags
        .map(
          (tag) =>
            `<span style="background: rgba(192, 57, 43, 0.15); border: 1px solid rgba(192, 57, 43, 0.3); color: #e74c3c; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${esc(tag)}</span>`
        )
        .join('\n      ')}
    </div>`
    : '';

  const subjectSection =
    data.subjectName.trim() || data.subjectWrestler.trim()
      ? `<div style="text-align: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid rgba(192, 57, 43, 0.15);">
  ${data.subjectName.trim() ? `<span style="font-size: 28px; font-weight: bold; color: #e74c3c; text-transform: uppercase; letter-spacing: 2px;">${esc(data.subjectName)}</span>` : ''}
  ${data.subjectWrestler.trim() ? `<span style="font-size: 13px; color: #888; display: block; margin-top: 4px;">(${esc(data.subjectWrestler)})</span>` : ''}
  ${tagsHtml}
</div>`
      : '';

  const bodyHtml = data.bodyText.trim()
    ? data.bodyText
        .trim()
        .split('\n\n')
        .map(
          (para) =>
            `<p style="color: #ccc; font-size: 14px; line-height: 1.8; margin: 0 0 16px;">${esc(para.trim())}</p>`
        )
        .join('\n')
    : '';

  const infoBox =
    data.infoBoxTitle.trim() || data.infoBoxBody.trim()
      ? `<div style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(192, 57, 43, 0.15); border-radius: 8px; padding: 16px; margin: 20px 0;">
  ${data.infoBoxTitle.trim() ? `<div style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #e74c3c; font-weight: 700; margin-bottom: 10px;">&#128683; ${esc(data.infoBoxTitle)}</div>` : ''}
  ${data.infoBoxBody.trim() ? `<p style="color: #aaa; font-size: 13px; line-height: 1.7; margin: 0;">${esc(data.infoBoxBody)}</p>` : ''}
</div>`
      : '';

  const quoteSection = data.quote.trim()
    ? `<div style="background: rgba(212, 175, 55, 0.06); border-left: 3px solid #d4af37; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 20px 0;">
  <p style="color: #ddd; font-size: 14px; line-height: 1.7; margin: 0; font-style: italic;">&ldquo;${esc(data.quote.trim())}&rdquo;</p>
  ${data.quoteAttribution.trim() ? `<div style="margin-top: 12px;"><span style="font-size: 14px; font-weight: 700; color: #d4af37;">&#8212; ${esc(data.quoteAttribution)}</span></div>` : ''}
</div>`
    : '';

  const footer = `
<div style="text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06);">
  <p style="font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; margin: 0; color: #e74c3c;">${esc(data.footerTagline || 'Zero tolerance. No exceptions.')}</p>
  <p style="color: #555; font-size: 11px; margin-top: 14px; letter-spacing: 1px; text-transform: uppercase;">League SZN Official &mdash; Office of the General Manager</p>
</div>`;

  return `<div style="font-family: 'Segoe UI', Arial, sans-serif; color: #e8e8e8; max-width: 620px; margin: 0 auto; background: linear-gradient(180deg, #0d0d0d 0%, #1a1018 50%, #0d0d0d 100%); border-radius: 12px; padding: 32px; border: 1px solid rgba(192, 57, 43, 0.3);">${banner}${header}
<div style="background: linear-gradient(135deg, rgba(192, 57, 43, 0.08), rgba(0, 0, 0, 0.2)); border: 1px solid rgba(192, 57, 43, 0.2); border-radius: 10px; padding: 24px; margin-top: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
${subjectSection}${bodyHtml}${infoBox}${quoteSection}
</div>${footer}
</div>`;
}

// ─── Step Configs ─────────────────────────────────────────────────────────────

const MATCH_CARD_STEPS = ['Show Details', 'GM Intro', 'Matches', 'Preview & Publish'];
const BREAKING_NEWS_STEPS = ['Headline & Subject', 'Story Body', 'Preview & Publish'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnnouncementWizard({ onClose, onPublished }: AnnouncementWizardProps) {
  const [mode, setMode] = useState<WizardMode>('select');
  const [step, setStep] = useState(1);

  const [matchCardData, setMatchCardData] = useState<MatchCardData>({ ...DEFAULT_MATCH_CARD });
  const [matches, setMatches] = useState<MatchSlot[]>([newMatch()]);

  const [breakingNewsData, setBreakingNewsData] = useState<BreakingNewsData>({
    ...DEFAULT_BREAKING_NEWS,
  });

  const [priority, setPriority] = useState(3);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const totalSteps = mode === 'match-card' ? MATCH_CARD_STEPS.length : BREAKING_NEWS_STEPS.length;
  const stepLabels = mode === 'match-card' ? MATCH_CARD_STEPS : BREAKING_NEWS_STEPS;

  const generatedHtml =
    mode === 'match-card'
      ? generateMatchCardHtml(matchCardData, matches)
      : mode === 'breaking-news'
      ? generateBreakingNewsHtml(breakingNewsData)
      : '';

  function selectMode(chosen: 'match-card' | 'breaking-news') {
    setMode(chosen);
    setStep(1);
    setError(null);
    setShowPreview(false);
  }

  function goNext() {
    setError(null);
    setStep((s) => Math.min(s + 1, totalSteps));
  }

  function goBack() {
    if (step === 1) {
      setMode('select');
      setStep(1);
    } else {
      setStep((s) => s - 1);
    }
  }

  // ── Match slot helpers ────────────────────────────────────────────────────

  function updateMatch(id: string, patch: Partial<MatchSlot>) {
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function updateParticipant(matchId: string, idx: number, patch: Partial<Participant>) {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;
        const updated = m.participants.map((p, i) => (i === idx ? { ...p, ...patch } : p));
        return { ...m, participants: updated };
      })
    );
  }

  function addParticipant(matchId: string) {
    setMatches((prev) =>
      prev.map((m) =>
        m.id === matchId
          ? { ...m, participants: [...m.participants, { username: '', wrestlerName: '' }] }
          : m
      )
    );
  }

  function removeParticipant(matchId: string, idx: number) {
    setMatches((prev) =>
      prev.map((m) =>
        m.id === matchId
          ? { ...m, participants: m.participants.filter((_, i) => i !== idx) }
          : m
      )
    );
  }

  function addMatch() {
    if (matches.length >= 5) return;
    setMatches((prev) => [...prev, newMatch()]);
  }

  function removeMatch(id: string) {
    if (matches.length <= 1) return;
    setMatches((prev) => prev.filter((m) => m.id !== id));
  }

  function moveMatch(id: string, dir: -1 | 1) {
    setMatches((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      const tmp = arr[idx] as MatchSlot;
      arr[idx] = arr[next] as MatchSlot;
      arr[next] = tmp;
      return arr;
    });
  }

  // ── Breaking news tag helpers ────────────────────────────────────────────

  function addTag() {
    const tag = breakingNewsData.newTag.trim();
    if (!tag || breakingNewsData.tags.includes(tag)) return;
    setBreakingNewsData((d) => ({ ...d, tags: [...d.tags, tag], newTag: '' }));
  }

  function removeTag(tag: string) {
    setBreakingNewsData((d) => ({ ...d, tags: d.tags.filter((t) => t !== tag) }));
  }

  // ── Publish ──────────────────────────────────────────────────────────────

  async function handlePublish() {
    setError(null);

    const title =
      mode === 'match-card'
        ? matchCardData.showName || "Tonight's Card"
        : breakingNewsData.headline || 'Breaking News';

    if (!title.trim() || !generatedHtml.trim()) {
      setError('Please complete the required fields before publishing.');
      return;
    }

    setSaving(true);
    try {
      await announcementsApi.create({
        title,
        body: generatedHtml,
        priority,
        isActive: true,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish announcement.');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (mode === 'select') {
    return (
      <div className="wizard-overlay">
        <div className="wizard-container">
          <div className="wizard-header">
            <h2 className="wizard-title">GM Announcement Wizard</h2>
            <button className="wizard-close" onClick={onClose} aria-label="Close wizard">
              ✕
            </button>
          </div>

          <p className="wizard-subtitle">What type of announcement are you creating?</p>

          <div className="wizard-mode-cards">
            <button className="wizard-mode-card" onClick={() => selectMode('match-card')}>
              <span className="wizard-mode-icon">📋</span>
              <span className="wizard-mode-label">Match Card</span>
              <span className="wizard-mode-desc">
                Tonight's card with GM intro and per-match promos
              </span>
            </button>
            <button className="wizard-mode-card" onClick={() => selectMode('breaking-news')}>
              <span className="wizard-mode-icon">⚡</span>
              <span className="wizard-mode-label">Breaking News</span>
              <span className="wizard-mode-desc">
                Suspension, title vacancy, official statement
              </span>
            </button>
          </div>

          <div className="wizard-footer-actions">
            <button className="wizard-btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-overlay">
      <div className="wizard-container wizard-container--wide">
        {/* Header */}
        <div className="wizard-header">
          <h2 className="wizard-title">
            {mode === 'match-card' ? 'Match Card Wizard' : 'Breaking News Wizard'}
          </h2>
          <button className="wizard-close" onClick={onClose} aria-label="Close wizard">
            ✕
          </button>
        </div>

        {/* Step indicator */}
        <div className="wizard-steps">
          {stepLabels.map((label, i) => (
            <div
              key={label}
              className={`wizard-step ${i + 1 === step ? 'wizard-step--active' : ''} ${i + 1 < step ? 'wizard-step--done' : ''}`}
            >
              <span className="wizard-step-num">{i + 1 < step ? '✓' : i + 1}</span>
              <span className="wizard-step-label">{label}</span>
            </div>
          ))}
        </div>

        {error && <div className="error-message wizard-error">{error}</div>}

        {/* ── Match Card Steps ── */}
        {mode === 'match-card' && (
          <>
            {step === 1 && (
              <div className="wizard-body">
                <h3 className="wizard-section-title">Show Details</h3>

                <div className="form-group">
                  <label htmlFor="wz-show-name">Show Name</label>
                  <input
                    id="wz-show-name"
                    type="text"
                    value={matchCardData.showName}
                    onChange={(e) =>
                      setMatchCardData((d) => ({ ...d, showName: e.target.value }))
                    }
                    placeholder="e.g. Tonight's Card"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="wz-division">Division / Subtitle <span className="wizard-optional">(optional)</span></label>
                  <input
                    id="wz-division"
                    type="text"
                    value={matchCardData.division}
                    onChange={(e) =>
                      setMatchCardData((d) => ({ ...d, division: e.target.value }))
                    }
                    placeholder="e.g. Heavyweight Division"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="wz-gm-name">GM Name</label>
                  <input
                    id="wz-gm-name"
                    type="text"
                    value={matchCardData.gmName}
                    onChange={(e) =>
                      setMatchCardData((d) => ({ ...d, gmName: e.target.value }))
                    }
                    placeholder="e.g. GM JP"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="wz-footer">Footer Tagline</label>
                  <input
                    id="wz-footer"
                    type="text"
                    value={matchCardData.footerTagline}
                    onChange={(e) =>
                      setMatchCardData((d) => ({ ...d, footerTagline: e.target.value }))
                    }
                    placeholder="e.g. The GM has spoken. Now fight."
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="wizard-body">
                <h3 className="wizard-section-title">GM Intro <span className="wizard-optional">(optional)</span></h3>
                <p className="wizard-hint">
                  This appears at the top of the card before the matches. Leave both fields empty to skip.
                </p>

                <div className="form-group">
                  <label htmlFor="wz-opening-scene">Opening Scene Direction <span className="wizard-optional">(optional)</span></label>
                  <textarea
                    id="wz-opening-scene"
                    value={matchCardData.openingSceneSetting}
                    onChange={(e) =>
                      setMatchCardData((d) => ({ ...d, openingSceneSetting: e.target.value }))
                    }
                    rows={3}
                    placeholder="e.g. *No Chance in Hell hits. GM JP strolls out, mic in hand...*"
                  />
                  <span className="wizard-field-hint">Displayed in italics as a stage direction.</span>
                </div>

                <div className="form-group">
                  <label htmlFor="wz-opening-promo">GM Opening Promo <span className="wizard-optional">(optional)</span></label>
                  <textarea
                    id="wz-opening-promo"
                    value={matchCardData.openingPromo}
                    onChange={(e) =>
                      setMatchCardData((d) => ({ ...d, openingPromo: e.target.value }))
                    }
                    rows={8}
                    placeholder={`"Ladies and gentlemen..."\n\nSeparate paragraphs with a blank line.`}
                  />
                  <span className="wizard-field-hint">Separate paragraphs with a blank line. Attribution (GM name) is added automatically.</span>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="wizard-body">
                <div className="wizard-matches-header">
                  <h3 className="wizard-section-title">Matches ({matches.length}/5)</h3>
                  {matches.length < 5 && (
                    <button className="wizard-btn-add" onClick={addMatch}>
                      + Add Match
                    </button>
                  )}
                </div>

                <div className="wizard-matches-list">
                  {matches.map((match, index) => {
                    const autoLabel =
                      match.isMainEvent || (index === matches.length - 1 && matches.length > 1)
                        ? 'Main Event'
                        : `Match ${index + 1}`;
                    return (
                      <div key={match.id} className={`wizard-match-slot ${match.isMainEvent || (index === matches.length - 1 && matches.length > 1) ? 'wizard-match-slot--main' : ''}`}>
                        <div className="wizard-match-slot-header">
                          <span className="wizard-match-slot-label">{match.badgeOverride || autoLabel}</span>
                          <div className="wizard-match-slot-controls">
                            <button
                              className="wizard-btn-icon"
                              onClick={() => moveMatch(match.id, -1)}
                              disabled={index === 0}
                              aria-label="Move up"
                            >
                              ↑
                            </button>
                            <button
                              className="wizard-btn-icon"
                              onClick={() => moveMatch(match.id, 1)}
                              disabled={index === matches.length - 1}
                              aria-label="Move down"
                            >
                              ↓
                            </button>
                            {matches.length > 1 && (
                              <button
                                className="wizard-btn-icon wizard-btn-icon--danger"
                                onClick={() => removeMatch(match.id)}
                                aria-label="Remove match"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="wizard-match-slot-body">
                          <div className="wizard-match-row">
                            <div className="form-group">
                              <label>Badge Label <span className="wizard-optional">(optional)</span></label>
                              <input
                                type="text"
                                value={match.badgeOverride}
                                onChange={(e) =>
                                  updateMatch(match.id, { badgeOverride: e.target.value })
                                }
                                placeholder={`Auto: "${autoLabel}"`}
                              />
                            </div>
                            <div className="form-group">
                              <label>Extra Badge <span className="wizard-optional">(optional)</span></label>
                              <input
                                type="text"
                                value={match.extraBadge}
                                onChange={(e) =>
                                  updateMatch(match.id, { extraBadge: e.target.value })
                                }
                                placeholder="e.g. Triple Threat, Ladder Match"
                              />
                            </div>
                          </div>

                          <div className="wizard-match-row">
                            <label className="wizard-checkbox-label">
                              <input
                                type="checkbox"
                                checked={match.isMainEvent}
                                onChange={(e) =>
                                  updateMatch(match.id, { isMainEvent: e.target.checked })
                                }
                              />
                              Force Main Event styling
                            </label>
                          </div>

                          <div className="form-group">
                            <label>Participants</label>
                            <div className="wizard-participants-list">
                              {match.participants.map((p, pIdx) => (
                                <div key={pIdx} className="wizard-participant-row">
                                  <input
                                    type="text"
                                    value={p.username}
                                    onChange={(e) =>
                                      updateParticipant(match.id, pIdx, {
                                        username: e.target.value,
                                      })
                                    }
                                    placeholder={`Player ${pIdx + 1} username`}
                                    className="wizard-participant-name"
                                  />
                                  <input
                                    type="text"
                                    value={p.wrestlerName}
                                    onChange={(e) =>
                                      updateParticipant(match.id, pIdx, {
                                        wrestlerName: e.target.value,
                                      })
                                    }
                                    placeholder="Wrestler name (optional)"
                                    className="wizard-participant-wrestler"
                                  />
                                  {match.participants.length > 2 && (
                                    <button
                                      className="wizard-btn-icon wizard-btn-icon--danger"
                                      onClick={() => removeParticipant(match.id, pIdx)}
                                      aria-label="Remove participant"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ))}
                              {match.participants.length < 6 && (
                                <button
                                  className="wizard-btn-text"
                                  onClick={() => addParticipant(match.id)}
                                >
                                  + Add Participant
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Optional promo toggle */}
                          <button
                            className={`wizard-promo-toggle ${match.showPromo ? 'wizard-promo-toggle--open' : ''}`}
                            onClick={() => updateMatch(match.id, { showPromo: !match.showPromo })}
                          >
                            {match.showPromo ? '▼ Hide Promo' : '▶ Add GM Promo'}{' '}
                            <span className="wizard-optional">(optional)</span>
                          </button>

                          {match.showPromo && (
                            <div className="wizard-promo-fields">
                              <div className="form-group">
                                <label>Scene Direction <span className="wizard-optional">(optional)</span></label>
                                <input
                                  type="text"
                                  value={match.sceneSetting}
                                  onChange={(e) =>
                                    updateMatch(match.id, { sceneSetting: e.target.value })
                                  }
                                  placeholder="e.g. *JP holds up one finger.*"
                                />
                              </div>
                              <div className="form-group">
                                <label>GM Speech <span className="wizard-optional">(optional)</span></label>
                                <textarea
                                  value={match.promo}
                                  onChange={(e) =>
                                    updateMatch(match.id, { promo: e.target.value })
                                  }
                                  rows={4}
                                  placeholder={`GM's words about this match.\n\nSeparate paragraphs with a blank line.`}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="wizard-body">
                <h3 className="wizard-section-title">Preview & Publish</h3>

                <div className="wizard-publish-settings">
                  <div className="form-group">
                    <label htmlFor="wz-priority">Priority</label>
                    <select
                      id="wz-priority"
                      value={priority}
                      onChange={(e) => setPriority(Number(e.target.value))}
                    >
                      <option value={1}>Low</option>
                      <option value={2}>Medium</option>
                      <option value={3}>High</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="wz-expires">Expires <span className="wizard-optional">(optional)</span></label>
                    <input
                      id="wz-expires"
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  className={`wizard-preview-toggle ${showPreview ? 'wizard-preview-toggle--open' : ''}`}
                  onClick={() => setShowPreview((v) => !v)}
                >
                  {showPreview ? '▼ Hide Preview' : '▶ Show Preview'}
                </button>

                {showPreview && (
                  <div className="wizard-preview-container">
                    <div
                      className="wizard-preview-render"
                      dangerouslySetInnerHTML={{ __html: generatedHtml }}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Breaking News Steps ── */}
        {mode === 'breaking-news' && (
          <>
            {step === 1 && (
              <div className="wizard-body">
                <h3 className="wizard-section-title">Headline & Subject</h3>

                <div className="form-group">
                  <label htmlFor="bn-headline">Headline *</label>
                  <input
                    id="bn-headline"
                    type="text"
                    value={breakingNewsData.headline}
                    onChange={(e) =>
                      setBreakingNewsData((d) => ({ ...d, headline: e.target.value }))
                    }
                    placeholder="e.g. Brock Lesnar Suspended & Stripped of World Heavyweight Championship"
                    maxLength={150}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="bn-date">Date Text</label>
                  <input
                    id="bn-date"
                    type="text"
                    value={breakingNewsData.dateText}
                    onChange={(e) =>
                      setBreakingNewsData((d) => ({ ...d, dateText: e.target.value }))
                    }
                    placeholder="e.g. April 4, 2026"
                  />
                </div>

                <div className="wizard-match-row">
                  <div className="form-group">
                    <label htmlFor="bn-subject">Subject Player Name <span className="wizard-optional">(optional)</span></label>
                    <input
                      id="bn-subject"
                      type="text"
                      value={breakingNewsData.subjectName}
                      onChange={(e) =>
                        setBreakingNewsData((d) => ({ ...d, subjectName: e.target.value }))
                      }
                      placeholder="e.g. Lynx"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="bn-wrestler">Wrestler Name <span className="wizard-optional">(optional)</span></label>
                    <input
                      id="bn-wrestler"
                      type="text"
                      value={breakingNewsData.subjectWrestler}
                      onChange={(e) =>
                        setBreakingNewsData((d) => ({
                          ...d,
                          subjectWrestler: e.target.value,
                        }))
                      }
                      placeholder="e.g. Brock Lesnar"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Status Tags <span className="wizard-optional">(optional)</span></label>
                  <div className="wizard-tags-row">
                    <input
                      type="text"
                      value={breakingNewsData.newTag}
                      onChange={(e) =>
                        setBreakingNewsData((d) => ({ ...d, newTag: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      placeholder="e.g. Suspended"
                    />
                    <button className="wizard-btn-secondary" onClick={addTag}>
                      Add
                    </button>
                  </div>
                  {breakingNewsData.tags.length > 0 && (
                    <div className="wizard-tags-list">
                      {breakingNewsData.tags.map((tag) => (
                        <span key={tag} className="wizard-tag">
                          {tag}
                          <button
                            onClick={() => removeTag(tag)}
                            className="wizard-tag-remove"
                            aria-label={`Remove tag ${tag}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="wizard-body">
                <h3 className="wizard-section-title">Story Body</h3>

                <div className="form-group">
                  <label htmlFor="bn-body">Body Text *</label>
                  <textarea
                    id="bn-body"
                    value={breakingNewsData.bodyText}
                    onChange={(e) =>
                      setBreakingNewsData((d) => ({ ...d, bodyText: e.target.value }))
                    }
                    rows={8}
                    placeholder={`League SZN management has confirmed...\n\nSeparate paragraphs with a blank line.`}
                  />
                  <span className="wizard-field-hint">Separate paragraphs with a blank line.</span>
                </div>

                <div className="form-group">
                  <label htmlFor="bn-infobox-title">Info Box Title <span className="wizard-optional">(optional)</span></label>
                  <input
                    id="bn-infobox-title"
                    type="text"
                    value={breakingNewsData.infoBoxTitle}
                    onChange={(e) =>
                      setBreakingNewsData((d) => ({ ...d, infoBoxTitle: e.target.value }))
                    }
                    placeholder="e.g. Matches Stricken From Record"
                  />
                </div>

                {(breakingNewsData.infoBoxTitle.trim() || breakingNewsData.infoBoxBody.trim()) && (
                  <div className="form-group">
                    <label htmlFor="bn-infobox-body">Info Box Content</label>
                    <textarea
                      id="bn-infobox-body"
                      value={breakingNewsData.infoBoxBody}
                      onChange={(e) =>
                        setBreakingNewsData((d) => ({ ...d, infoBoxBody: e.target.value }))
                      }
                      rows={3}
                      placeholder="Details for the info box..."
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="bn-quote">GM Quote <span className="wizard-optional">(optional)</span></label>
                  <textarea
                    id="bn-quote"
                    value={breakingNewsData.quote}
                    onChange={(e) =>
                      setBreakingNewsData((d) => ({ ...d, quote: e.target.value }))
                    }
                    rows={3}
                    placeholder="The integrity of this league is non-negotiable..."
                  />
                </div>

                {breakingNewsData.quote.trim() && (
                  <div className="form-group">
                    <label htmlFor="bn-attribution">Quote Attribution</label>
                    <input
                      id="bn-attribution"
                      type="text"
                      value={breakingNewsData.quoteAttribution}
                      onChange={(e) =>
                        setBreakingNewsData((d) => ({
                          ...d,
                          quoteAttribution: e.target.value,
                        }))
                      }
                      placeholder="e.g. GM JP"
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="bn-footer">Footer Tagline</label>
                  <input
                    id="bn-footer"
                    type="text"
                    value={breakingNewsData.footerTagline}
                    onChange={(e) =>
                      setBreakingNewsData((d) => ({ ...d, footerTagline: e.target.value }))
                    }
                    placeholder="e.g. Zero tolerance. No exceptions."
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="wizard-body">
                <h3 className="wizard-section-title">Preview & Publish</h3>

                <div className="wizard-publish-settings">
                  <div className="form-group">
                    <label htmlFor="bn-priority">Priority</label>
                    <select
                      id="bn-priority"
                      value={priority}
                      onChange={(e) => setPriority(Number(e.target.value))}
                    >
                      <option value={1}>Low</option>
                      <option value={2}>Medium</option>
                      <option value={3}>High</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="bn-expires">Expires <span className="wizard-optional">(optional)</span></label>
                    <input
                      id="bn-expires"
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  className={`wizard-preview-toggle ${showPreview ? 'wizard-preview-toggle--open' : ''}`}
                  onClick={() => setShowPreview((v) => !v)}
                >
                  {showPreview ? '▼ Hide Preview' : '▶ Show Preview'}
                </button>

                {showPreview && (
                  <div className="wizard-preview-container">
                    <div
                      className="wizard-preview-render"
                      dangerouslySetInnerHTML={{ __html: generatedHtml }}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Footer nav */}
        <div className="wizard-footer-actions">
          <button className="wizard-btn-secondary" onClick={goBack}>
            {step === 1 ? '← Change Type' : '← Back'}
          </button>

          {step < totalSteps ? (
            <button className="wizard-btn-primary" onClick={goNext}>
              Next →
            </button>
          ) : (
            <button
              className="wizard-btn-publish"
              onClick={handlePublish}
              disabled={saving}
            >
              {saving ? 'Publishing...' : '✓ Publish Announcement'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
