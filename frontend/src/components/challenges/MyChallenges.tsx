import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Megaphone } from 'lucide-react';
import { challengesApi, profileApi } from '../../services/api';
import { isApiError } from '../../services/api/apiClient';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { useIsHiddenPlayer } from '../../hooks/useIsHiddenPlayer';
import type { Player } from '../../types';
import type { ChallengeWithPlayers } from '../../types/challenge';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import { useToast } from '../ui/toastContext';
import HiddenPlayerNotice from '../profile/HiddenPlayerNotice';
import ChallengeStatusBadge from './ChallengeStatusBadge';
import { getChallengeSides, getDisplayStatus, isChallengedSide, isChallengerSide } from './challengeUtils';
import './MyChallenges.css';

type MyTab = 'sent' | 'received';
type ChallengeAction = 'accept' | 'decline' | 'cancel';

const CALL_OUT_PATH = '/promos/new?promoType=call-out';

/** Null for an account with no player, such as staff who do not wrestle. */
async function loadOwnProfile(signal: AbortSignal): Promise<Player | null> {
  try {
    return await profileApi.getMyProfile(signal);
  } catch (err) {
    if (isApiError(err, 404)) return null;
    throw err;
  }
}

export default function MyChallenges() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isHiddenPlayer = useIsHiddenPlayer();
  const { features } = useSiteConfig();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<MyTab>('received');
  const [challenges, setChallenges] = useState<ChallengeWithPlayers[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [noPlayerProfile, setNoPlayerProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyChallengeId, setBusyChallengeId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        // profileApi identifies the current player through backend auth.
        const [myProfile, allChallenges] = await Promise.all([
          loadOwnProfile(controller.signal),
          challengesApi.getAll(undefined, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setChallenges(allChallenges);
        setCurrentPlayerId(myProfile?.playerId ?? null);
        setNoPlayerProfile(myProfile === null);
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [reloadKey]);

  const sentChallenges = useMemo(
    () => challenges.filter((challenge) => isChallengerSide(challenge, currentPlayerId)),
    [challenges, currentPlayerId],
  );
  const receivedChallenges = useMemo(
    () => challenges.filter((challenge) => isChallengedSide(challenge, currentPlayerId)),
    [challenges, currentPlayerId],
  );
  const currentList = activeTab === 'sent' ? sentChallenges : receivedChallenges;

  const handleAction = useCallback(async (action: ChallengeAction, challenge: ChallengeWithPlayers) => {
    setBusyChallengeId(challenge.challengeId);
    try {
      if (action === 'cancel') {
        await challengesApi.cancel(challenge.challengeId);
      } else {
        await challengesApi.respond(challenge.challengeId, action);
      }
      const [challenger, challenged] = getChallengeSides(challenge);
      const opponent = isChallengerSide(challenge, currentPlayerId) ? challenged : challenger;
      showToast(t('challenges.my.actionFeedback', { action, opponent: opponent.name }), 'success');
      setChallenges(await challengesApi.getAll());

      // After accepting, go straight to a response promo.
      if (action === 'accept' && features.promos) {
        navigate('/promos/new', {
          state: { promoType: 'response', targetPlayerId: challenge.challengerId },
        });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyChallengeId(null);
    }
  }, [currentPlayerId, features.promos, navigate, showToast, t]);

  const renderChallengeItem = (challenge: ChallengeWithPlayers) => {
    const isSent = isChallengerSide(challenge, currentPlayerId);
    const [challenger, challenged] = getChallengeSides(challenge);
    const opponent = isSent ? challenged : challenger;
    const isOpen = getDisplayStatus(challenge) === 'pending';
    const busy = busyChallengeId === challenge.challengeId;
    const matchLine = [challenge.matchType, challenge.stipulation].filter(Boolean).join(' · ');

    return (
      <Card key={challenge.challengeId} className="my-challenge">
        <div className="my-challenge__top">
          <Avatar src={opponent.imageUrl} name={opponent.name} />
          <div className="my-challenge__who">
            <span className="my-challenge__name">{opponent.name}</span>
            <span className="my-challenge__detail">{opponent.detail}</span>
          </div>
          <ChallengeStatusBadge challenge={challenge} />
        </div>

        <p className="my-challenge__match">
          {matchLine}
          {challenge.challengeMode === 'tag_team' && <Badge>{t('challenges.board.tagTeamMatch')}</Badge>}
        </p>

        {challenge.message && <p className="my-challenge__message">&ldquo;{challenge.message}&rdquo;</p>}
        {challenge.responseMessage && (
          <p className="my-challenge__message">
            <strong>{t('challenges.my.response')}:</strong> &ldquo;{challenge.responseMessage}&rdquo;
          </p>
        )}

        <div className="my-challenge__footer">
          <span className="my-challenge__date">{new Date(challenge.createdAt).toLocaleDateString()}</span>
          <div className="my-challenge__actions">
            {!isSent && isOpen && (
              <>
                <Button size="sm" disabled={busy} onClick={() => handleAction('accept', challenge)}>
                  {t('challenges.detail.accept')}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => handleAction('decline', challenge)}>
                  {t('challenges.detail.decline')}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => navigate(`/challenges/${challenge.challengeId}`)}>
                  {t('challenges.detail.counter')}
                </Button>
              </>
            )}
            {isSent && isOpen && (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => handleAction('cancel', challenge)}>
                {t('common.cancel')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => navigate(`/challenges/${challenge.challengeId}`)}>
              {t('challenges.my.viewDetails')}
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  const renderList = () => {
    if (loading) return <Skeleton variant="block" count={3} />;
    if (error) {
      return (
        <EmptyState
          title={t('challenges.board.loadError', 'Could not load challenges')}
          description={error}
          actionLabel={t('common.retry')}
          onAction={() => setReloadKey((key) => key + 1)}
        />
      );
    }
    if (currentList.length === 0) {
      const canCallOut = activeTab === 'sent' && !isHiddenPlayer;
      return (
        <EmptyState
          icon={<Megaphone aria-hidden="true" />}
          title={activeTab === 'sent' ? t('challenges.my.noSent') : t('challenges.my.noReceived')}
          actionLabel={canCallOut ? t('promos.editor.cutCallOut', 'Cut a Call-Out Promo') : undefined}
          onAction={canCallOut ? () => navigate(CALL_OUT_PATH) : undefined}
        />
      );
    }
    return <div className="my-challenges__list">{currentList.map(renderChallengeItem)}</div>;
  };

  const tabLabel = (label: string, count: number) => (
    <>
      {label}
      <span className="my-challenges__count">{count}</span>
    </>
  );

  if (noPlayerProfile) {
    return (
      <div className="my-challenges">
        <PageHeader title={t('challenges.my.title')} />
        <EmptyState
          icon={<Megaphone aria-hidden="true" />}
          title={t('challenges.my.noPlayerTitle')}
          description={t('challenges.my.noPlayerBody')}
        />
      </div>
    );
  }

  return (
    <div className="my-challenges">
      <PageHeader
        title={t('challenges.my.title')}
        actions={isHiddenPlayer ? undefined : <Button to={CALL_OUT_PATH}>{t('promos.editor.cutCallOut', 'Cut a Call-Out Promo')}</Button>}
      />
      {isHiddenPlayer && (
        <HiddenPlayerNotice title={t('me.setup.cannotCallOutTitle')} body={t('me.setup.cannotCallOutBody')} />
      )}
      <Tabs
        label={t('challenges.my.title')}
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as MyTab)}
        items={[
          { value: 'received', label: tabLabel(t('challenges.my.received'), receivedChallenges.length) },
          { value: 'sent', label: tabLabel(t('challenges.my.sent'), sentChallenges.length) },
        ]}
      />
      <div className="my-challenges__body">{renderList()}</div>
    </div>
  );
}
