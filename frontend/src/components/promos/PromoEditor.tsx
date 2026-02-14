import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { PromoType, PromoWithContext } from '../../types/promo';
import { playersApi, promosApi, championshipsApi, matchesApi, challengesApi, stipulationsApi, matchTypesApi } from '../../services/api';
import type { Player, Match, Championship, Stipulation, MatchType } from '../../types';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
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

const VALID_PROMO_TYPES = new Set<string>(PROMO_TYPES.map((pt) => pt.value));

function isPromoType(value: unknown): value is PromoType {
  return typeof value === 'string' && VALID_PROMO_TYPES.has(value);
}

/** Shape of location state passed via navigate() for pre-filling the editor. */
interface PromoEditorLocationState {
  promoType?: unknown;
  targetPlayerId?: unknown;
  challengeId?: unknown;
}

const MAX_CONTENT = 2000;
const MIN_CONTENT = 50;

export default function PromoEditor() {
  const { t } = useTranslation();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { features } = useSiteConfig();

  // Read pre-fill values from location state (preferred) or search params (fallback).
  // Using useState initializer callbacks so values are read exactly once on mount.
  const locationState = (location.state ?? {}) as PromoEditorLocationState;

  const [promoType, setPromoType] = useState<PromoType>(() => {
    const fromState = locationState.promoType;
    const fromParams = searchParams.get('promoType');
    const candidate = fromState ?? fromParams;
    return isPromoType(candidate) ? candidate : 'open-mic';
  });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetPlayerId, setTargetPlayerId] = useState<string>(() => {
    const fromState = locationState.targetPlayerId;
    const fromParams = searchParams.get('targetPlayerId');
    const candidate = fromState ?? fromParams;
    return typeof candidate === 'string' ? candidate : '';
  });
  const [targetPromoId, setTargetPromoId] = useState('');
  // challengeId is stored so downstream submission logic can link the promo to a challenge.
  // Prefixed with underscore until CreatePromoInput is extended to include challengeId.
  const [_challengeId] = useState<string>(() => {
    const fromState = locationState.challengeId;
    const fromParams = searchParams.get('challengeId');
    const candidate = fromState ?? fromParams;
    return typeof candidate === 'string' ? candidate : '';
  });
  const [matchId, setMatchId] = useState('');
  const [championshipId, setChampionshipId] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeMatchType, setChallengeMatchType] = useState('');
  const [challengeStipulation, setChallengeStipulation] = useState('');
  const [challengeCreated, setChallengeCreated] = useState(false);
  const [challengeWarning, setChallengeWarning] = useState<string | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [allPromos, setAllPromos] = useState<PromoWithContext[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      playersApi.getAll(controller.signal),
      promosApi.getAll(undefined, controller.signal),
      matchesApi.getAll(undefined, controller.signal),
      championshipsApi.getAll(controller.signal),
      stipulationsApi.getAll(controller.signal),
      matchTypesApi.getAll(controller.signal),
    ])
      .then(([pl, pr, ma, ch, stips, mTypes]) => {
        setPlayers(pl);
        setAllPromos(pr);
        setMatches(ma);
        setChampionships(ch);
        setStipulations(stips);
        setMatchTypes(mTypes);

        // Find current user's player
        const idToken = sessionStorage.getItem('idToken');
        if (idToken) {
          try {
            const payload = JSON.parse(atob(idToken.split('.')[1]!));
            const myPlayer = pl.find((p: Player) => p.userId === payload.sub);
            if (myPlayer) {
              setCurrentPlayer(myPlayer);
              return;
            }
          } catch { /* ignore */ }
        }
        if (pl.length > 0) setCurrentPlayer(pl[0] ?? null);
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  const showTargetPlayer = promoType === 'call-out' || promoType === 'response';
  const showTargetPromo = promoType === 'response';
  const showMatch = promoType === 'pre-match' || promoType === 'post-match';
  const showChampionship = promoType === 'championship';

  const targetPromos = useMemo(() => {
    if (!targetPlayerId) return [];
    return allPromos.filter((p) => p.playerId === targetPlayerId);
  }, [targetPlayerId, allPromos]);

  const contentLength = content.length;
  const isContentValid = contentLength >= MIN_CONTENT && contentLength <= MAX_CONTENT;
  const canSubmit = isContentValid && promoType && !submitting;

  const previewPromo = useMemo((): PromoWithContext => {
    const targetPlayer = players.find((p) => p.playerId === targetPlayerId);
    const targetPromo = allPromos.find((p) => p.promoId === targetPromoId);
    const match = matches.find((m) => m.matchId === matchId);
    const championship = championships.find((c) => c.championshipId === championshipId);

    return {
      promoId: 'preview',
      playerId: currentPlayer?.playerId || '',
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
      playerName: currentPlayer?.name || '',
      wrestlerName: currentPlayer?.currentWrestler || '',
      targetPlayerName: targetPlayer?.name,
      targetWrestlerName: targetPlayer?.currentWrestler,
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
      matchName: match ? `${match.participants[0] ?? '?'} vs ${match.participants[1] ?? '?'}` : undefined,
      championshipName: championship?.name,
      responseCount: 0,
    };
  }, [promoType, title, content, targetPlayerId, targetPromoId, matchId, championshipId, t, players, allPromos, matches, championships, currentPlayer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setChallengeCreated(false);
    setChallengeWarning(null);
    try {
      await promosApi.create({
        promoType,
        title: title || undefined,
        content,
        targetPlayerId: targetPlayerId || undefined,
        targetPromoId: targetPromoId || undefined,
        matchId: matchId || undefined,
        championshipId: championshipId || undefined,
      });

      // Auto-create challenge when submitting a call-out promo
      if (promoType === 'call-out' && targetPlayerId && features.challenges) {
        try {
          await challengesApi.create({
            challengedId: targetPlayerId,
            matchType: challengeMatchType,
            stipulation: challengeStipulation || undefined,
            message: (title || content.slice(0, 500)) || undefined,
          });
          setChallengeCreated(true);
        } catch {
          setChallengeWarning(
            t('promos.editor.challengeFailed', 'Promo published, but the challenge could not be created. You can issue it separately.')
          );
        }
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create promo');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="promo-editor">
        <div className="promo-editor-success">
          <div className="success-icon">{'\u{1F3A4}'}</div>
          <h2>{t('promos.editor.successTitle', 'Promo Submitted!')}</h2>
          {challengeCreated ? (
            <p>{t('promos.editor.challengeCreated', 'Your call-out promo has been published and a challenge has been issued!')}</p>
          ) : challengeWarning ? (
            <p className="challenge-warning">{challengeWarning}</p>
          ) : (
            <p>{t('promos.editor.successMessage', 'Your promo has been published to the feed.')}</p>
          )}
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
                setChallengeMatchType('');
                setChallengeStipulation('');
                setChallengeCreated(false);
                setChallengeWarning(null);
                setError(null);
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

      {error && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

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
              {players.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.currentWrestler} ({player.name})
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
              {matches.map((match) => (
                <option key={match.matchId} value={match.matchId}>
                  {match.matchFormat} - {match.date}
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
              {championships.map((champ) => (
                <option key={champ.championshipId} value={champ.championshipId}>
                  {champ.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Challenge Match Type & Stipulation (call-out only) */}
        {promoType === 'call-out' && (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="challenge-match-type">
                {t('promos.editor.matchType', 'Match Type')}
              </label>
              <select
                id="challenge-match-type"
                className="form-select"
                value={challengeMatchType}
                onChange={(e) => setChallengeMatchType(e.target.value)}
              >
                <option value="">{t('challenges.issue.selectMatchType', '-- Select match type --')}</option>
                {matchTypes.map((mt) => (
                  <option key={mt.matchTypeId} value={mt.name}>
                    {mt.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="challenge-stipulation">
                {t('promos.editor.stipulation', 'Stipulation')}
              </label>
              <select
                id="challenge-stipulation"
                className="form-select"
                value={challengeStipulation}
                onChange={(e) => setChallengeStipulation(e.target.value)}
              >
                <option value="">{t('common.none', 'None')}</option>
                {stipulations.map((s) => (
                  <option key={s.stipulationId} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </>
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
            {submitting ? 'Submitting...' : t('promos.editor.submit', 'Drop the Mic')}
          </button>
        </div>
      </form>
    </div>
  );
}
