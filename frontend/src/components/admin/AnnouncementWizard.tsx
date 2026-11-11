import { useRef, useState } from 'react';
import { ClipboardList, Clapperboard, Zap } from 'lucide-react';
import { announcementsApi, imagesApi } from '../../services/api';
import { toMediaUrl } from '../../utils/mediaUrl';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import Modal from '../ui/Modal';
import AdminNotice from './AdminNotice';
import {
  generateBreakingNewsHtml,
  generateMatchCardHtml,
  generateMediaPackageHtml,
  type BreakingNewsData,
  type MatchCardData,
  type MatchSlot,
  type MediaPackageData,
  type Participant,
} from './announcementHtml';
import '../announcementContent.css';
import './adminContent.css';
import './AnnouncementWizard.css';

interface AnnouncementWizardProps {
  onClose: () => void;
  onPublished: () => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardMode = 'select' | 'match-card' | 'breaking-news' | 'media-package';
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

function ordinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatDateOrdinal(d: Date): string {
  const month = d.toLocaleString('en-US', { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}${ordinalSuffix(day)}, ${year}`;
}

const DEFAULT_MEDIA_PACKAGE: MediaPackageData = {
  format: 'video',
  title: '',
  subtitle: '',
  dateText: formatDateOrdinal(new Date()),
  mediaUrl: '',
  posterArtCredit: '',
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

// ─── Step Configs ─────────────────────────────────────────────────────────────

const MATCH_CARD_STEPS = ['Show Details', 'GM Intro', 'Matches', 'Preview & Publish'];
const BREAKING_NEWS_STEPS = ['Headline & Subject', 'Story Body', 'Preview & Publish'];
const MEDIA_PACKAGE_STEPS = ['Media Details', 'Preview & Publish'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnnouncementWizard({ onClose, onPublished }: AnnouncementWizardProps) {
  const [mode, setMode] = useState<WizardMode>('select');
  const [step, setStep] = useState(1);

  const [matchCardData, setMatchCardData] = useState<MatchCardData>({ ...DEFAULT_MATCH_CARD });
  const [matches, setMatches] = useState<MatchSlot[]>([newMatch()]);

  const [breakingNewsData, setBreakingNewsData] = useState<BreakingNewsData>({
    ...DEFAULT_BREAKING_NEWS,
  });

  const [mediaPackageData, setMediaPackageData] = useState<MediaPackageData>({
    ...DEFAULT_MEDIA_PACKAGE,
  });
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const [priority, setPriority] = useState(3);
  const [showAsPopup, setShowAsPopup] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const totalSteps =
    mode === 'match-card'
      ? MATCH_CARD_STEPS.length
      : mode === 'breaking-news'
      ? BREAKING_NEWS_STEPS.length
      : MEDIA_PACKAGE_STEPS.length;
  const stepLabels =
    mode === 'match-card'
      ? MATCH_CARD_STEPS
      : mode === 'breaking-news'
      ? BREAKING_NEWS_STEPS
      : MEDIA_PACKAGE_STEPS;

  const generatedHtml =
    mode === 'match-card'
      ? generateMatchCardHtml(matchCardData, matches)
      : mode === 'breaking-news'
      ? generateBreakingNewsHtml(breakingNewsData)
      : mode === 'media-package'
      ? generateMediaPackageHtml(mediaPackageData)
      : '';

  function selectMode(chosen: 'match-card' | 'breaking-news' | 'media-package') {
    setMode(chosen);
    setStep(1);
    setError(null);
    setShowPreview(false);
  }

  async function handleMediaFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingMedia(true);
    try {
      const folder = mediaPackageData.format === 'video' ? 'videos' : 'shows';
      const { uploadUrl, imageUrl } = await imagesApi.generateUploadUrl(
        file.name,
        file.type,
        folder
      );
      if (mediaPackageData.format === 'video') {
        await imagesApi.uploadVideoToS3(uploadUrl, file);
      } else {
        await imagesApi.uploadToS3(uploadUrl, file);
      }
      setMediaPackageData((d) => ({ ...d, mediaUrl: imageUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file.');
    } finally {
      setUploadingMedia(false);
      if (mediaInputRef.current) mediaInputRef.current.value = '';
    }
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
    if (matches.length >= 8) return;
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
        : mode === 'breaking-news'
        ? breakingNewsData.headline || 'Breaking News'
        : mediaPackageData.title ||
          (mediaPackageData.format === 'video' ? 'Video Package' : 'Official Announcement');

    if (!title.trim() || !generatedHtml.trim()) {
      setError('Please complete the required fields before publishing.');
      return;
    }

    if (mode === 'media-package' && !mediaPackageData.mediaUrl.trim()) {
      const noun = mediaPackageData.format === 'video' ? 'video' : 'image';
      setError(`Please provide a ${noun} URL or upload a ${noun} file.`);
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
        showAsPopup,
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
      <Modal open onClose={onClose} title="GM Announcement Wizard" size="md">
        <div className="wizard-container">
          <p className="wizard-subtitle">What type of announcement are you creating?</p>

          <div className="wizard-mode-cards">
            <button className="wizard-mode-card" onClick={() => selectMode('match-card')}>
              <ClipboardList className="wizard-mode-icon" aria-hidden="true" size={28} />
              <span className="wizard-mode-label">Match Card</span>
              <span className="wizard-mode-desc">
                Tonight's card with GM intro and per-match promos
              </span>
            </button>
            <button className="wizard-mode-card" onClick={() => selectMode('breaking-news')}>
              <Zap className="wizard-mode-icon" aria-hidden="true" size={28} />
              <span className="wizard-mode-label">Breaking News</span>
              <span className="wizard-mode-desc">
                Suspension, title vacancy, official statement
              </span>
            </button>
            <button className="wizard-mode-card" onClick={() => selectMode('media-package')}>
              <Clapperboard className="wizard-mode-icon" aria-hidden="true" size={28} />
              <span className="wizard-mode-label">Video / Poster</span>
              <span className="wizard-mode-desc">
                Promo video package or official poster announcement
              </span>
            </button>
          </div>

          <div className="wizard-footer-actions">
            <button className="wizard-btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        mode === 'match-card'
          ? 'Match Card Wizard'
          : mode === 'breaking-news'
          ? 'Breaking News Wizard'
          : 'Video / Poster Wizard'
      }
    >
      <div className="wizard-container">
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

        {error && <AdminNotice tone="error">{error}</AdminNotice>}

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
                  <h3 className="wizard-section-title">Matches ({matches.length}/8)</h3>
                  {matches.length < 8 && (
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

                <label className="wizard-checkbox-label wizard-popup-option">
                  <input
                    id="wz-popup"
                    type="checkbox"
                    checked={showAsPopup}
                    onChange={(e) => setShowAsPopup(e.target.checked)}
                  />
                  Also show as a pop-up when members open the site
                </label>

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
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(generatedHtml) }}
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

                <label className="wizard-checkbox-label wizard-popup-option">
                  <input
                    id="bn-popup"
                    type="checkbox"
                    checked={showAsPopup}
                    onChange={(e) => setShowAsPopup(e.target.checked)}
                  />
                  Also show as a pop-up when members open the site
                </label>

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
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(generatedHtml) }}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Media Package Steps ── */}
        {mode === 'media-package' && (
          <>
            {step === 1 && (
              <div className="wizard-body">
                <h3 className="wizard-section-title">Media Details</h3>

                <div className="form-group">
                  <label>Format</label>
                  <div className="wizard-tags-row">
                    <label className="wizard-checkbox-label">
                      <input
                        type="radio"
                        name="mp-format"
                        checked={mediaPackageData.format === 'video'}
                        onChange={() =>
                          setMediaPackageData((d) => ({ ...d, format: 'video', mediaUrl: '' }))
                        }
                      />
                      Video Package
                    </label>
                    <label className="wizard-checkbox-label">
                      <input
                        type="radio"
                        name="mp-format"
                        checked={mediaPackageData.format === 'poster'}
                        onChange={() =>
                          setMediaPackageData((d) => ({ ...d, format: 'poster', mediaUrl: '' }))
                        }
                      />
                      Poster / Image
                    </label>
                  </div>
                  <span className="wizard-field-hint">
                    {mediaPackageData.format === 'video'
                      ? 'Embeds an mp4 in a red Video Package frame.'
                      : 'Embeds an image in a gold Official Announcement frame.'}
                  </span>
                </div>

                <div className="form-group">
                  <label htmlFor="mp-title">Title *</label>
                  <input
                    id="mp-title"
                    type="text"
                    value={mediaPackageData.title}
                    onChange={(e) =>
                      setMediaPackageData((d) => ({ ...d, title: e.target.value }))
                    }
                    placeholder={
                      mediaPackageData.format === 'video'
                        ? 'e.g. CM Punk Promo'
                        : 'e.g. Open Weight Title Match Set'
                    }
                    maxLength={150}
                  />
                </div>

                {mediaPackageData.format === 'poster' && (
                  <div className="form-group">
                    <label htmlFor="mp-subtitle">Subtitle <span className="wizard-optional">(optional)</span></label>
                    <input
                      id="mp-subtitle"
                      type="text"
                      value={mediaPackageData.subtitle}
                      onChange={(e) =>
                        setMediaPackageData((d) => ({ ...d, subtitle: e.target.value }))
                      }
                      placeholder="e.g. CM Punk vs Bron Breakker"
                    />
                    <span className="wizard-field-hint">Shown in gold beneath the title.</span>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="mp-date">Date Text</label>
                  <input
                    id="mp-date"
                    type="text"
                    value={mediaPackageData.dateText}
                    onChange={(e) =>
                      setMediaPackageData((d) => ({ ...d, dateText: e.target.value }))
                    }
                    placeholder="e.g. May 1st, 2026"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="mp-url">
                    {mediaPackageData.format === 'video' ? 'Video URL *' : 'Image URL *'}
                  </label>
                  <input
                    id="mp-url"
                    type="text"
                    value={mediaPackageData.mediaUrl}
                    onChange={(e) =>
                      setMediaPackageData((d) => ({ ...d, mediaUrl: e.target.value }))
                    }
                    placeholder={
                      mediaPackageData.format === 'video'
                        ? 'https://... or paste an existing /videos/... path'
                        : 'https://... link to image file'
                    }
                  />
                  <div className="wizard-tags-row wizard-tags-row--spaced">
                    <input
                      ref={mediaInputRef}
                      type="file"
                      accept={mediaPackageData.format === 'video' ? 'video/*' : 'image/*'}
                      onChange={handleMediaFileChange}
                      disabled={uploadingMedia}
                    />
                    {uploadingMedia && (
                      <span className="wizard-field-hint">Uploading…</span>
                    )}
                  </div>
                  {mediaPackageData.mediaUrl && !uploadingMedia && (
                    <span className="wizard-field-hint">
                      Resolved:{' '}
                      {mediaPackageData.format === 'video'
                        ? toMediaUrl(mediaPackageData.mediaUrl)
                        : mediaPackageData.mediaUrl}
                    </span>
                  )}
                </div>

                {mediaPackageData.format === 'poster' && (
                  <div className="form-group">
                    <label htmlFor="mp-credit">Poster Art Credit <span className="wizard-optional">(optional)</span></label>
                    <input
                      id="mp-credit"
                      type="text"
                      value={mediaPackageData.posterArtCredit}
                      onChange={(e) =>
                        setMediaPackageData((d) => ({ ...d, posterArtCredit: e.target.value }))
                      }
                      placeholder="e.g. Kai"
                    />
                    <span className="wizard-field-hint">Renders as “Poster Art by [name]”.</span>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="wizard-body">
                <h3 className="wizard-section-title">Preview & Publish</h3>

                <div className="wizard-publish-settings">
                  <div className="form-group">
                    <label htmlFor="mp-priority">Priority</label>
                    <select
                      id="mp-priority"
                      value={priority}
                      onChange={(e) => setPriority(Number(e.target.value))}
                    >
                      <option value={1}>Low</option>
                      <option value={2}>Medium</option>
                      <option value={3}>High</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="mp-expires">Expires <span className="wizard-optional">(optional)</span></label>
                    <input
                      id="mp-expires"
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                  </div>
                </div>

                <label className="wizard-checkbox-label wizard-popup-option">
                  <input
                    id="mp-popup"
                    type="checkbox"
                    checked={showAsPopup}
                    onChange={(e) => setShowAsPopup(e.target.checked)}
                  />
                  Also show as a pop-up when members open the site
                </label>

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
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(generatedHtml) }}
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
    </Modal>
  );
}
