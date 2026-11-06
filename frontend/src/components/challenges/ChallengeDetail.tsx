import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { challengesApi, profileApi, stipulationsApi, matchTypesApi } from '../../services/api';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { useIsHiddenPlayer } from '../../hooks/useIsHiddenPlayer';
import type { Stipulation, MatchType } from '../../types';
import type { ChallengeWithPlayers } from '../../types/challenge';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/toastContext';
import ChallengeStatusBadge from './ChallengeStatusBadge';
import ChallengeVersus from './ChallengeVersus';
import { getChallengeDeadline, getChallengeSides, getDisplayStatus, isChallengedSide, isChallengerSide } from './challengeUtils';
import './ChallengeDetail.css';

type DetailAction = 'accept' | 'decline' | 'cancel' | 'counter';

const LONG_DATE: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };

/** The profile only decides which actions show, so a staff account without one still reads the page. */
async function loadViewerPlayerId(signal: AbortSignal): Promise<string | null> {
  try {
    const profile = await profileApi.getMyProfile(signal);
    return profile.playerId;
  } catch {
    return null;
  }
}

export default function ChallengeDetail() {
  const { t } = useTranslation();
  const { challengeId } = useParams<{ challengeId: string }>();
  const navigate = useNavigate();
  const { features } = useSiteConfig();
  const { showToast } = useToast();
  const isHiddenPlayer = useIsHiddenPlayer();
  const [challenge, setChallenge] = useState<ChallengeWithPlayers | null>(null);
  const [counterChallenge, setCounterChallenge] = useState<ChallengeWithPlayers | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterMatchType, setCounterMatchType] = useState('');
  const [counterStipulation, setCounterStipulation] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setCounterChallenge(null);
    const load = async () => {
      try {
        const [mainChallenge, viewerPlayerId, stips, mTypes] = await Promise.all([
          challengesApi.getById(challengeId!, controller.signal),
          loadViewerPlayerId(controller.signal),
          stipulationsApi.getAll(controller.signal),
          matchTypesApi.getAll(controller.signal),
        ]);
        setChallenge(mainChallenge);
        setCurrentPlayerId(viewerPlayerId);
        setStipulations(stips);
        setMatchTypes(mTypes);

        if (mainChallenge.counteredChallengeId) {
          setCounterChallenge(await challengesApi.getById(mainChallenge.counteredChallengeId, controller.signal));
        }
      } catch (err) {
        if (!controller.signal.aborted) console.error('Failed to load challenge details:', err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [challengeId]);

  const handleAction = async (action: DetailAction) => {
    if (!challenge) return;
    if (action === 'counter' && !counterMatchType) return;
    setSubmitting(true);
    try {
      if (action === 'accept' || action === 'decline') {
        await challengesApi.respond(challenge.challengeId, action);
      } else if (action === 'cancel') {
        await challengesApi.cancel(challenge.challengeId);
      } else {
        await challengesApi.respond(challenge.challengeId, 'counter', {
          counterMatchType,
          counterStipulation: counterStipulation || undefined,
          counterMessage: counterMessage || undefined,
        });
        setShowCounterForm(false);
      }
      showToast(t('challenges.detail.actionConfirmed', { action }), 'success');

      const updated = await challengesApi.getById(challengeId!);
      setChallenge(updated);
      if (updated.counteredChallengeId) {
        setCounterChallenge(await challengesApi.getById(updated.counteredChallengeId));
      }
      // After accepting, go straight to a response promo.
      if (action === 'accept' && features.promos) {
        navigate('/promos/new', {
          state: { promoType: 'response', targetPlayerId: updated.challengerId },
        });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const backLink = (
    <Button variant="ghost" size="sm" to="/challenges" icon={<ArrowLeft aria-hidden="true" size={18} />} className="challenge-detail__back">
      {t('challenges.detail.backToBoard')}
    </Button>
  );

  if (loading) {
    return (
      <div className="challenge-detail">
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="challenge-detail">
        {backLink}
        <EmptyState title={t('challenges.detail.notFound')} />
      </div>
    );
  }

  const isOpen = getDisplayStatus(challenge) === 'pending';
  const canRespond = isOpen && isChallengedSide(challenge, currentPlayerId);
  const canCancel = isOpen && isChallengerSide(challenge, currentPlayerId);
  const [challengerSide, challengedSide] = getChallengeSides(challenge);
  const deadline = getChallengeDeadline(challenge);

  return (
    <div className="challenge-detail">
      {backLink}

      <PageHeader
        eyebrow={t('challenges.detail.title')}
        title={challenge.matchType}
        subtitle={challenge.stipulation}
        actions={(
          <>
            {challenge.championshipId && <Badge tone="warning">{t('challenges.board.titleMatch')}</Badge>}
            {challenge.challengeMode === 'tag_team' && <Badge>{t('challenges.board.tagTeamMatch')}</Badge>}
            <ChallengeStatusBadge challenge={challenge} />
          </>
        )}
      />

      <section className="challenge-detail__hero">
        <ChallengeVersus challenge={challenge} size="lg" showRoles />
      </section>

      {(canRespond || canCancel) && (
        <div className="challenge-detail__actions">
          {canRespond && (
            <>
              <Button disabled={submitting} onClick={() => handleAction('accept')}>
                {t('challenges.detail.accept')}
              </Button>
              <Button variant="secondary" disabled={submitting} onClick={() => handleAction('decline')}>
                {t('challenges.detail.decline')}
              </Button>
              {!isHiddenPlayer && (
                <Button variant="secondary" disabled={submitting} onClick={() => setShowCounterForm(true)}>
                  {t('challenges.detail.counter')}
                </Button>
              )}
            </>
          )}
          {canCancel && (
            <Button variant="danger" disabled={submitting} onClick={() => handleAction('cancel')}>
              {t('challenges.detail.cancel')}
            </Button>
          )}
        </div>
      )}

      {(challenge.message || challenge.responseMessage) && (
        <section className="challenge-detail__section">
          <h2 className="challenge-detail__heading">{t('challenges.detail.messages')}</h2>
          {challenge.message && (
            <blockquote className="challenge-detail__quote">
              <cite>{challengerSide.name} ({challengerSide.detail})</cite>
              <p>&ldquo;{challenge.message}&rdquo;</p>
            </blockquote>
          )}
          {challenge.responseMessage && (
            <blockquote className="challenge-detail__quote challenge-detail__quote--reply">
              <cite>{challengedSide.name} ({challengedSide.detail})</cite>
              <p>&ldquo;{challenge.responseMessage}&rdquo;</p>
            </blockquote>
          )}
        </section>
      )}

      <dl className="challenge-detail__facts">
        <div>
          <dt>{t('challenges.detail.created')}</dt>
          <dd>{new Date(challenge.createdAt).toLocaleDateString(undefined, LONG_DATE)}</dd>
        </div>
        {deadline !== null && (
          <div>
            <dt>{t('challenges.detail.expires')}</dt>
            <dd>{new Date(deadline).toLocaleDateString(undefined, LONG_DATE)}</dd>
          </div>
        )}
      </dl>

      {counterChallenge && (
        <section className="challenge-detail__section">
          <h2 className="challenge-detail__heading">{t('challenges.detail.counterChallenge')}</h2>
          <Card to={`/challenges/${counterChallenge.challengeId}`} className="challenge-detail__link-card">
            <span>
              <span className="challenge-detail__link-title">
                {counterChallenge.challenger.wrestlerName} {t('common.vs')} {counterChallenge.challenged.wrestlerName}
              </span>
              <span className="challenge-detail__link-subtitle">
                {[counterChallenge.matchType, counterChallenge.stipulation].filter(Boolean).join(' - ')}
              </span>
            </span>
            <ChevronRight aria-hidden="true" size={20} />
          </Card>
        </section>
      )}

      {challenge.matchId && (
        <Card to="/events" className="challenge-detail__link-card">
          <span className="challenge-detail__link-title">{t('challenges.detail.viewScheduledMatch')}</span>
          <ChevronRight aria-hidden="true" size={20} />
        </Card>
      )}

      <Modal
        open={showCounterForm}
        onClose={() => setShowCounterForm(false)}
        title={t('challenges.detail.counterChallenge')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowCounterForm(false)}>{t('common.cancel')}</Button>
            <Button loading={submitting} disabled={!counterMatchType} onClick={() => handleAction('counter')}>
              {submitting ? t('common.submitting') : t('challenges.issue.submit')}
            </Button>
          </>
        )}
      >
        <div className="challenge-detail__form">
          <label className="challenge-detail__field" htmlFor="counter-match-type">
            {t('challenges.issue.matchType')} *
          </label>
          <Select
            id="counter-match-type"
            label={t('challenges.issue.matchType')}
            placeholder={t('challenges.issue.selectMatchType')}
            value={counterMatchType}
            onValueChange={setCounterMatchType}
            options={matchTypes.map((matchType) => ({ value: matchType.name, label: matchType.name }))}
          />
          <label className="challenge-detail__field" htmlFor="counter-stipulation">
            {t('challenges.issue.stipulation')}
          </label>
          <Select
            id="counter-stipulation"
            label={t('challenges.issue.stipulation')}
            value={counterStipulation}
            onValueChange={setCounterStipulation}
            options={[
              { value: '', label: t('common.none', 'None') },
              ...stipulations.map((stipulation) => ({ value: stipulation.name, label: stipulation.name })),
            ]}
          />
          <label className="challenge-detail__field" htmlFor="counter-message">
            {t('challenges.issue.message')}
          </label>
          <textarea
            id="counter-message"
            className="challenge-detail__textarea"
            value={counterMessage}
            onChange={(event) => setCounterMessage(event.target.value)}
            placeholder={t('challenges.issue.messagePlaceholder')}
            rows={3}
            maxLength={500}
          />
        </div>
      </Modal>
    </div>
  );
}
