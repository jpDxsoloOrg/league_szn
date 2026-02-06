import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PromoType } from '../../types/promo';
import { mockPlayers, mockPromos, mockMatches, mockChampionships } from '../../mocks/promoMockData';
import PromoCard from './PromoCard';
import './PromoEditor.css';

const PROMO_TYPES: { value: PromoType; labelKey: string; fallback: string; descKey: string; descFallback: string }[] = [
  {
    value: 'open-mic',
    labelKey: 'promos.types.open-mic',
    fallback: 'Open Mic',
    descKey: 'promos.editor.typeDesc.open-mic',
    descFallback: 'Speak your mind on any topic. No target required.',
  },
  {
    value: 'call-out',
    labelKey: 'promos.types.call-out',
    fallback: 'Call-Out',
    descKey: 'promos.editor.typeDesc.call-out',
    descFallback: 'Challenge another wrestler directly.',
  },
  {
    value: 'response',
    labelKey: 'promos.types.response',
    fallback: 'Response',
    descKey: 'promos.editor.typeDesc.response',
    descFallback: 'Respond to another wrestler\'s promo.',
  },
  {
    value: 'pre-match',
    labelKey: 'promos.types.pre-match',
    fallback: 'Pre-Match',
    descKey: 'promos.editor.typeDesc.pre-match',
    descFallback: 'Hype up an upcoming match.',
  },
  {
    value: 'post-match',
    labelKey: 'promos.types.post-match',
    fallback: 'Post-Match',
    descKey: 'promos.editor.typeDesc.post-match',
    descFallback: 'React to a completed match.',
  },
  {
    value: 'championship',
    labelKey: 'promos.types.championship',
    fallback: 'Championship',
    descKey: 'promos.editor.typeDesc.championship',
    descFallback: 'Address a championship situation.',
  },
  {
    value: 'return',
    labelKey: 'promos.types.return',
    fallback: 'Return',
    descKey: 'promos.editor.typeDesc.return',
    descFallback: 'Announce your return to the league.',
  },
];

const MAX_CONTENT = 2000;
const MIN_CONTENT = 50;

export default function PromoEditor() {
  const { t } = useTranslation();
  const [promoType, setPromoType] = useState<PromoType>('open-mic');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetPlayerId, setTargetPlayerId] = useState('');
  const [targetPromoId, setTargetPromoId] = useState('');
  const [matchId, setMatchId] = useState('');
  const [championshipId, setChampionshipId] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const showTargetPlayer = promoType === 'call-out' || promoType === 'response';
  const showTargetPromo = promoType === 'response';
  const showMatch = promoType === 'pre-match' || promoType === 'post-match';
  const showChampionship = promoType === 'championship';

  const targetPromos = useMemo(() => {
    if (!targetPlayerId) return [];
    return mockPromos.filter((p) => p.playerId === targetPlayerId && !p.isHidden);
  }, [targetPlayerId]);

  const contentLength = content.length;
  const isContentValid = contentLength >= MIN_CONTENT && contentLength <= MAX_CONTENT;
  const canSubmit = isContentValid && promoType;

  const previewPromo = useMemo(() => {
    const currentPlayer = mockPlayers[0]!;
    const targetPlayer = mockPlayers.find((p) => p.playerId === targetPlayerId);
    const targetPromo = mockPromos.find((p) => p.promoId === targetPromoId);
    const match = mockMatches.find((m) => m.matchId === matchId);
    const championship = mockChampionships.find((c) => c.championshipId === championshipId);

    return {
      promoId: 'preview',
      playerId: currentPlayer.playerId,
      promoType,
      title: title || undefined,
      content: content || t('promos.editor.previewPlaceholder', 'Your promo content will appear here...'),
      targetPlayerId: targetPlayerId || undefined,
      targetPromoId: targetPromoId || undefined,
      matchId: matchId || undefined,
      championshipId: championshipId || undefined,
      reactions: {},
      reactionCounts: { fire: 0, mic: 0, trash: 0, 'mind-blown': 0, clap: 0 },
      isPinned: false,
      isHidden: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      playerName: currentPlayer.playerName,
      wrestlerName: currentPlayer.wrestlerName,
      targetPlayerName: targetPlayer?.playerName,
      targetWrestlerName: targetPlayer?.wrestlerName,
      targetPromo: targetPromo
        ? {
            promoId: targetPromo.promoId,
            playerId: targetPromo.playerId,
            promoType: targetPromo.promoType,
            title: targetPromo.title,
            content: '',
            reactions: {},
            reactionCounts: targetPromo.reactionCounts,
            isPinned: false,
            isHidden: false,
            createdAt: targetPromo.createdAt,
            updatedAt: targetPromo.updatedAt,
          }
        : undefined,
      matchName: match?.matchName,
      championshipName: championship?.championshipName,
      responseCount: 0,
    };
  }, [promoType, title, content, targetPlayerId, targetPromoId, matchId, championshipId, t]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="promo-editor">
        <div className="promo-editor-success">
          <div className="success-icon">{'\u{1F3A4}'}</div>
          <h2>{t('promos.editor.successTitle', 'Promo Submitted!')}</h2>
          <p>{t('promos.editor.successMessage', 'Your promo has been published to the feed.')}</p>
          <div className="success-actions">
            <Link to="/promos" className="success-link">
              {t('promos.editor.viewFeed', 'View Promo Feed')}
            </Link>
            <button
              className="success-another"
              onClick={() => {
                setSubmitted(false);
                setTitle('');
                setContent('');
                setTargetPlayerId('');
                setTargetPromoId('');
                setMatchId('');
                setChampionshipId('');
              }}
            >
              {t('promos.editor.cutAnother', 'Cut Another Promo')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="promo-editor">
      <div className="promo-editor-header">
        <Link to="/promos" className="back-btn">
          {'\u2190'} {t('promos.thread.backToFeed', 'Back to Promos')}
        </Link>
        <h2>{t('promos.editor.title', 'Cut a Promo')}</h2>
        <p className="editor-subtitle">
          {t('promos.editor.subtitle', 'Grab the mic and let the WWE Universe hear your voice.')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="promo-editor-form">
        {/* Promo Type Selector */}
        <div className="form-group">
          <label className="form-label">
            {t('promos.editor.promoType', 'Promo Type')}
          </label>
          <div className="promo-type-grid">
            {PROMO_TYPES.map((pt) => (
              <button
                key={pt.value}
                type="button"
                className={`promo-type-option ${promoType === pt.value ? 'selected' : ''}`}
                onClick={() => {
                  setPromoType(pt.value);
                  setTargetPlayerId('');
                  setTargetPromoId('');
                  setMatchId('');
                  setChampionshipId('');
                }}
              >
                <span className="type-name">{t(pt.labelKey, pt.fallback)}</span>
                <span className="type-desc">{t(pt.descKey, pt.descFallback)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="form-group">
          <label className="form-label" htmlFor="promo-title">
            {t('promos.editor.promoTitle', 'Title')}
            <span className="form-optional">({t('promos.editor.optional', 'optional')})</span>
          </label>
          <input
            id="promo-title"
            type="text"
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('promos.editor.titlePlaceholder', 'Give your promo a catchy title...')}
            maxLength={100}
          />
        </div>

        {/* Content */}
        <div className="form-group">
          <label className="form-label" htmlFor="promo-content">
            {t('promos.editor.content', 'Content')}
          </label>
          <textarea
            id="promo-content"
            className={`form-textarea ${contentLength > 0 && !isContentValid ? 'invalid' : ''}`}
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT))}
            placeholder={t(
              'promos.editor.contentPlaceholder',
              'Drop your promo here... Use @WrestlerName to mention others.'
            )}
            rows={8}
          />
          <div className="char-counter">
            <span className={contentLength < MIN_CONTENT ? 'under-min' : ''}>
              {contentLength}/{MAX_CONTENT}
            </span>
            {contentLength < MIN_CONTENT && (
              <span className="min-warning">
                {t('promos.editor.minChars', 'Minimum {{min}} characters', { min: MIN_CONTENT })}
              </span>
            )}
          </div>
        </div>

        {/* Target Player */}
        {showTargetPlayer && (
          <div className="form-group">
            <label className="form-label" htmlFor="target-player">
              {t('promos.editor.targetPlayer', 'Target Wrestler')}
            </label>
            <select
              id="target-player"
              className="form-select"
              value={targetPlayerId}
              onChange={(e) => {
                setTargetPlayerId(e.target.value);
                setTargetPromoId('');
              }}
            >
              <option value="">
                {t('promos.editor.selectPlayer', '-- Select a wrestler --')}
              </option>
              {mockPlayers.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.wrestlerName} ({player.playerName})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Target Promo */}
        {showTargetPromo && targetPlayerId && (
          <div className="form-group">
            <label className="form-label" htmlFor="target-promo">
              {t('promos.editor.targetPromo', 'Responding to Promo')}
            </label>
            <select
              id="target-promo"
              className="form-select"
              value={targetPromoId}
              onChange={(e) => setTargetPromoId(e.target.value)}
            >
              <option value="">
                {t('promos.editor.selectPromo', '-- Select a promo --')}
              </option>
              {targetPromos.map((promo) => (
                <option key={promo.promoId} value={promo.promoId}>
                  {promo.title || promo.content.slice(0, 60) + '...'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Match */}
        {showMatch && (
          <div className="form-group">
            <label className="form-label" htmlFor="match-select">
              {t('promos.editor.match', 'Match')}
            </label>
            <select
              id="match-select"
              className="form-select"
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
            >
              <option value="">
                {t('promos.editor.selectMatch', '-- Select a match --')}
              </option>
              {mockMatches.map((match) => (
                <option key={match.matchId} value={match.matchId}>
                  {match.matchName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Championship */}
        {showChampionship && (
          <div className="form-group">
            <label className="form-label" htmlFor="championship-select">
              {t('promos.editor.championship', 'Championship')}
            </label>
            <select
              id="championship-select"
              className="form-select"
              value={championshipId}
              onChange={(e) => setChampionshipId(e.target.value)}
            >
              <option value="">
                {t('promos.editor.selectChampionship', '-- Select a championship --')}
              </option>
              {mockChampionships.map((champ) => (
                <option key={champ.championshipId} value={champ.championshipId}>
                  {champ.championshipName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Preview Toggle */}
        <div className="form-group">
          <button
            type="button"
            className="preview-toggle"
            onClick={() => setShowPreview((prev) => !prev)}
          >
            {showPreview
              ? t('promos.editor.hidePreview', 'Hide Preview')
              : t('promos.editor.showPreview', 'Show Preview')}
          </button>
        </div>

        {showPreview && (
          <div className="promo-preview-section">
            <h3 className="preview-title">{t('promos.editor.preview', 'Preview')}</h3>
            <PromoCard promo={previewPromo} />
          </div>
        )}

        {/* Submit */}
        <div className="form-actions">
          <Link to="/promos" className="cancel-btn">
            {t('common.cancel', 'Cancel')}
          </Link>
          <button type="submit" className="submit-btn" disabled={!canSubmit}>
            {t('promos.editor.submit', 'Drop the Mic')}
          </button>
        </div>
      </form>
    </div>
  );
}
