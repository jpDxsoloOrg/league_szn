import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Mic } from 'lucide-react';
import { PromoType, PromoWithContext } from '../../types/promo';
import { playersApi, promosApi, championshipsApi, matchesApi, challengesApi, stipulationsApi, matchTypesApi, tagTeamsApi } from '../../services/api';
import { rivalriesApi } from '../../services/api/rivalries.api';
import type { Player, Match, Championship, Stipulation, MatchType } from '../../types';
import type { TagTeam } from '../../types/tagTeam';
import type { Rivalry } from '../../types/rivalry';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { useIsHiddenPlayer } from '../../hooks/useIsHiddenPlayer';
import HiddenPlayerNotice from '../profile/HiddenPlayerNotice';
import Button from '../ui/Button';
import Card from '../ui/Card';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import { getChallengeTitleOptions } from '../challenges/challengeUtils';
import { useSignupBlock } from '../../hooks/useSignupBlock';
import { refusalOr } from '../../utils/discipline';
import SuspensionNotice from '../discipline/SuspensionNotice';
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
  {
    value: 'rivalry',
    labelKey: 'promos.types.rivalry',
    fallback: 'Rivalry',
    descKey: 'promos.editor.typeDesc.rivalry',
    descFallback: 'Advance one of your rivalries without calling anyone out directly.',
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
  const signupBlock = useSignupBlock();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { features } = useSiteConfig();
  const isHiddenPlayer = useIsHiddenPlayer();

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
  const [rivalryId, setRivalryId] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challengeMatchType, setChallengeMatchType] = useState('');
  const [challengeStipulation, setChallengeStipulation] = useState('');
  const [challengeCreated, setChallengeCreated] = useState(false);
  const [challengeWarning, setChallengeWarning] = useState<string | null>(null);
  const [challengeMode, setChallengeMode] = useState<'singles' | 'tag_team'>('singles');
  const [selectedTagTeamId, setSelectedTagTeamId] = useState('');

  const [players, setPlayers] = useState<Player[]>([]);
  const [allPromos, setAllPromos] = useState<PromoWithContext[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [tagTeams, setTagTeams] = useState<TagTeam[]>([]);
  const [playerTagTeam, setPlayerTagTeam] = useState<TagTeam | null>(null);
  const [myRivalries, setMyRivalries] = useState<Rivalry[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      playersApi.getAll(controller.signal),
      promosApi.getAll(undefined, controller.signal),
      matchesApi.getAll(undefined, controller.signal),
      championshipsApi.getAll(controller.signal),
      stipulationsApi.getAll(controller.signal),
      matchTypesApi.getAll(controller.signal),
      tagTeamsApi.getAll({ status: 'active' }, controller.signal).catch(() => [] as TagTeam[]),
    ])
      .then(([pl, pr, ma, ch, stips, mTypes, fetchedTagTeams]) => {
        setPlayers(pl);
        setAllPromos(pr);
        setMatches(ma);
        setChampionships(ch);
        setStipulations(stips);
        setMatchTypes(mTypes);
        setTagTeams(fetchedTagTeams);

        // Find current user's player
        let foundPlayer: Player | null = null;
        const idToken = sessionStorage.getItem('idToken');
        if (idToken) {
          try {
            const payload = JSON.parse(atob(idToken.split('.')[1]!));
            const myPlayer = pl.find((p: Player) => p.userId === payload.sub);
            if (myPlayer) {
              foundPlayer = myPlayer;
            }
          } catch { /* ignore */ }
        }
        if (!foundPlayer && pl.length > 0) {
          foundPlayer = pl[0] ?? null;
        }
        setCurrentPlayer(foundPlayer);

        // Find current player's tag team
        if (foundPlayer) {
          const myTeam = fetchedTagTeams.find(
            (tt) => tt.player1Id === foundPlayer!.playerId || tt.player2Id === foundPlayer!.playerId
          );
          setPlayerTagTeam(myTeam || null);

          // Load rivalries the current player is a participant in.
          // Fire-and-forget; if it fails, the rivalry promo picker will
          // just show an empty list rather than blocking the editor.
          rivalriesApi
            .list({ participantId: foundPlayer.playerId, limit: 50 }, controller.signal)
            .then((res) => setMyRivalries(res.rivalries ?? []))
            .catch(() => {});
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  const showTargetPlayer = promoType === 'call-out' || promoType === 'response';
  const showTargetPromo = promoType === 'response';
  const showMatch = promoType === 'pre-match' || promoType === 'post-match';
  const showChampionship = promoType === 'championship';
  const showRivalryPicker = promoType === 'rivalry';

  const targetPromos = useMemo(() => {
    if (!targetPlayerId) return [];
    return allPromos.filter((p) => p.playerId === targetPlayerId);
  }, [targetPlayerId, allPromos]);

  const contentLength = content.length;
  const isContentValid = contentLength >= MIN_CONTENT && contentLength <= MAX_CONTENT;
  const needsTargetPromo = promoType === 'response';
  const hasTargetPromo = !!targetPromoId;
  const needsRivalry = promoType === 'rivalry';
  const hasRivalry = !!rivalryId;
  // A call-out always issues a challenge, which needs an opponent and a match type.
  const needsChallenge = promoType === 'call-out' && features.challenges;
  const hasChallengeDetails =
    !!challengeMatchType && (challengeMode === 'tag_team' ? !!selectedTagTeamId : !!targetPlayerId);
  const challengeTitles = useMemo(() => {
    if (!needsChallenge) return [];
    const toCandidates = (playerIds: string[]) =>
      playerIds.map((playerId) => players.find((p) => p.playerId === playerId) ?? { playerId });
    const opposingTeam = tagTeams.find((tt) => tt.tagTeamId === selectedTagTeamId);
    const sides = challengeMode === 'tag_team'
      ? [playerTagTeam, opposingTeam].flatMap((tt) => (tt ? [toCandidates([tt.player1Id, tt.player2Id])] : []))
      : [currentPlayer?.playerId, targetPlayerId].flatMap((id) => (id ? [toCandidates([id])] : []));
    return getChallengeTitleOptions(championships, { challengeMode, matchType: challengeMatchType, sides });
  }, [needsChallenge, players, tagTeams, selectedTagTeamId, challengeMode, playerTagTeam, currentPlayer, targetPlayerId, championships, challengeMatchType]);
  // A change of opponent or match type can rule out a title picked earlier.
  const stakedChampionshipId = needsChallenge && !challengeTitles.some((c) => c.championshipId === championshipId)
    ? ''
    : championshipId;
  // A call-out leads to a match, so a sign-up block stops it. Other promos stay open.
  const callOutBlocked = promoType === 'call-out' && signupBlock.blocked;
  const canSubmit =
    !isHiddenPlayer &&
    !callOutBlocked &&
    isContentValid &&
    promoType &&
    !submitting &&
    (!needsTargetPromo || hasTargetPromo) &&
    (!needsRivalry || hasRivalry) &&
    (!needsChallenge || hasChallengeDetails);

  const previewPromo = useMemo((): PromoWithContext => {
    const wrestlerNameFor = (id: string) => players.find((p) => p.playerId === id)?.currentWrestler ?? id;
    const targetPlayer = players.find((p) => p.playerId === targetPlayerId);
    const targetPromo = allPromos.find((p) => p.promoId === targetPromoId);
    const match = matches.find((m) => m.matchId === matchId);
    const championship = championships.find((c) => c.championshipId === stakedChampionshipId);

    return {
      promoId: 'preview',
      playerId: currentPlayer?.playerId || '',
      promoType,
      title: title || undefined,
      content: content || t('promos.editor.previewPlaceholder', 'Your promo content will appear here...'),
      targetPlayerId: targetPlayerId || undefined,
      targetPromoId: targetPromoId || undefined,
      matchId: matchId || undefined,
      championshipId: stakedChampionshipId || undefined,
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
      matchName: match ? match.participants.slice(0, 2).map(wrestlerNameFor).join(' vs ') : undefined,
      championshipName: championship?.name,
      responseCount: 0,
    };
  }, [promoType, title, content, targetPlayerId, targetPromoId, matchId, stakedChampionshipId, t, players, allPromos, matches, championships, currentPlayer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setChallengeCreated(false);
    setChallengeWarning(null);
    try {
      const selectedTeam = tagTeams.find((tt) => tt.tagTeamId === selectedTagTeamId);
      const promo = await promosApi.create({
        promoType,
        title: title || undefined,
        content,
        targetPlayerId: targetPlayerId || undefined,
        targetPromoId: targetPromoId || undefined,
        matchId: matchId || undefined,
        championshipId: stakedChampionshipId || undefined,
        rivalryId: rivalryId || undefined,
        ...(promoType === 'call-out' && challengeMode === 'tag_team' && playerTagTeam && selectedTeam ? {
          challengeMode: 'tag_team',
          challengerTagTeamName: playerTagTeam.name,
          targetTagTeamName: selectedTeam.name,
          targetTagTeamId: selectedTeam.tagTeamId,
        } : {}),
      });

      // Auto-create challenge when submitting a call-out promo
      if (needsChallenge) {
        try {
          if (challengeMode === 'tag_team') {
            await challengesApi.create({
              challengedId: '',
              challengeMode: 'tag_team',
              challengedTagTeamId: selectedTagTeamId,
              matchType: challengeMatchType,
              stipulation: challengeStipulation || undefined,
              championshipId: stakedChampionshipId || undefined,
              message: (title || content.slice(0, 500)) || undefined,
              promoId: promo.promoId,
            });
          } else {
            await challengesApi.create({
              challengedId: targetPlayerId,
              matchType: challengeMatchType,
              stipulation: challengeStipulation || undefined,
              championshipId: stakedChampionshipId || undefined,
              message: (title || content.slice(0, 500)) || undefined,
              promoId: promo.promoId,
            });
          }
          setChallengeCreated(true);
        } catch (err) {
          setChallengeWarning(
            refusalOr(err, t('promos.editor.challengeFailed', 'Promo published, but the challenge could not be created. You can issue it separately.'))
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

  const resetForm = () => {
    setSubmitted(false);
    setTitle('');
    setContent('');
    setTargetPlayerId('');
    setTargetPromoId('');
    setMatchId('');
    setChampionshipId('');
    setRivalryId('');
    setChallengeMatchType('');
    setChallengeStipulation('');
    setChallengeCreated(false);
    setChallengeWarning(null);
    setChallengeMode('singles');
    setSelectedTagTeamId('');
    setError(null);
  };

  if (submitted) {
    return (
      <div className="promo-editor">
        <Card padding="lg" className="promo-editor__success">
          <Mic aria-hidden="true" size={40} />
          <h1>{t('promos.editor.successTitle', 'Promo Submitted!')}</h1>
          {challengeCreated ? (
            <p>{t('promos.editor.challengeCreated', 'Your call-out promo has been published and a challenge has been issued!')}</p>
          ) : challengeWarning ? (
            <p className="promo-editor__warning">{challengeWarning}</p>
          ) : (
            <p>{t('promos.editor.successMessage', 'Your promo has been published to the feed.')}</p>
          )}
          <div className="promo-editor__success-actions">
            <Button to="/promos">{t('promos.editor.viewFeed', 'View Promo Feed')}</Button>
            <Button variant="secondary" onClick={resetForm}>
              {t('promos.editor.cutAnother', 'Cut Another Promo')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const selectedType = PROMO_TYPES.find((pt) => pt.value === promoType);
  const playerOptions = players.map((player) => ({
    value: player.playerId,
    label: `${player.currentWrestler} (${player.name})`,
  }));
  const tagTeamOptions = tagTeams
    .filter((tt) => tt.tagTeamId !== playerTagTeam?.tagTeamId)
    .map((tt) => {
      const p1 = players.find((p) => p.playerId === tt.player1Id);
      const p2 = players.find((p) => p.playerId === tt.player2Id);
      const names = [p1?.currentWrestler || tt.player1Id, p2?.currentWrestler || tt.player2Id].join(' & ');
      return { value: tt.tagTeamId, label: `${tt.name} (${names})` };
    });
  const rivalryOptions = myRivalries.map((r) => {
    const opponents = r.participants
      .filter((p) => p.playerId !== currentPlayer?.playerId)
      .map((p) => {
        const player = players.find((pl) => pl.playerId === p.playerId);
        return player?.currentWrestler ?? player?.name ?? p.playerId;
      })
      .join(', ');
    const label = r.title
      ? r.title
      : opponents
        ? t('promos.editor.rivalryVs', 'vs {{opponents}}', { opponents })
        : r.rivalryId;
    return { value: r.rivalryId, label };
  });

  return (
    <div className="promo-editor">
      <Button variant="ghost" size="sm" to="/promos" icon={<ArrowLeft aria-hidden="true" size={18} />}>
        {t('promos.thread.backToFeed', 'Back to Promos')}
      </Button>

      <PageHeader
        title={t('promos.editor.title', 'Cut a Promo')}
        subtitle={t('promos.editor.subtitle', 'Grab the mic and let the WWE Universe hear your voice.')}
      />

      {isHiddenPlayer && (
        <HiddenPlayerNotice title={t('me.setup.cannotCutPromoTitle')} body={t('me.setup.cannotCutPromoBody')} />
      )}

      {callOutBlocked && signupBlock.until && <SuspensionNotice until={signupBlock.until} />}

      {error && <div className="promo-editor__error" role="alert">{error}</div>}

      <form onSubmit={handleSubmit} className="promo-editor__form">
        <div className="promo-editor__field">
          <span className="promo-editor__label" id="promo-type-label">
            {t('promos.editor.promoType', 'Promo Type')}
          </span>
          <div className="promo-editor__types" role="radiogroup" aria-labelledby="promo-type-label">
            {PROMO_TYPES.map((pt) => (
              <button
                key={pt.value}
                type="button"
                role="radio"
                aria-checked={promoType === pt.value}
                className={`promo-editor__type ${promoType === pt.value ? 'promo-editor__type--selected' : ''}`}
                onClick={() => {
                  setPromoType(pt.value);
                  setTargetPlayerId('');
                  setTargetPromoId('');
                  setMatchId('');
                  setChampionshipId('');
                  setRivalryId('');
                }}
              >
                {t(pt.labelKey, pt.fallback)}
              </button>
            ))}
          </div>
          {selectedType && (
            <p className="promo-editor__hint">{t(selectedType.descKey, selectedType.descFallback)}</p>
          )}
        </div>

        {promoType === 'call-out' && playerTagTeam && (
          <fieldset className="promo-editor__fieldset">
            <legend className="promo-editor__label">{t('challenges.issue.challengeMode', 'Challenge Mode')}</legend>
            <div className="promo-editor__modes">
              <label className="promo-editor__mode">
                <input
                  type="radio"
                  name="challengeMode"
                  value="singles"
                  checked={challengeMode === 'singles'}
                  onChange={() => { setChallengeMode('singles'); setSelectedTagTeamId(''); }}
                />
                {t('challenges.issue.singlesChallenge', 'Singles')}
              </label>
              <label className="promo-editor__mode">
                <input
                  type="radio"
                  name="challengeMode"
                  value="tag_team"
                  checked={challengeMode === 'tag_team'}
                  onChange={() => { setChallengeMode('tag_team'); setTargetPlayerId(''); setTargetPromoId(''); }}
                />
                {t('challenges.issue.tagTeamChallenge', 'Tag Team')}
              </label>
            </div>
            {challengeMode === 'tag_team' && (
              <p className="promo-editor__hint">
                {t('challenges.issue.onBehalfOf', 'On behalf of')}: <strong>{playerTagTeam.name}</strong>
              </p>
            )}
          </fieldset>
        )}

        {showTargetPlayer && (promoType !== 'call-out' || challengeMode === 'singles') && (
          <div className="promo-editor__field">
            <label className="promo-editor__label" htmlFor="target-player">
              {t('promos.editor.targetPlayer', 'Target Wrestler')}
            </label>
            <Select
              id="target-player"
              label={t('promos.editor.targetPlayer', 'Target Wrestler')}
              placeholder={t('promos.editor.selectPlayer', '-- Select a wrestler --')}
              value={targetPlayerId}
              onValueChange={(value) => {
                setTargetPlayerId(value);
                setTargetPromoId('');
              }}
              options={playerOptions}
            />
          </div>
        )}

        {promoType === 'call-out' && challengeMode === 'tag_team' && (
          <div className="promo-editor__field">
            <label className="promo-editor__label" htmlFor="target-tag-team">
              {t('challenges.issue.selectOpponentTeam', 'Target Tag Team')}
            </label>
            <Select
              id="target-tag-team"
              label={t('challenges.issue.selectOpponentTeam', 'Target Tag Team')}
              placeholder={t('challenges.issue.selectOpponentTeamPlaceholder', '-- Select a tag team --')}
              value={selectedTagTeamId}
              onValueChange={setSelectedTagTeamId}
              options={tagTeamOptions}
            />
          </div>
        )}

        {showTargetPromo && (
          <div className="promo-editor__field">
            <label className="promo-editor__label" htmlFor="target-promo">
              {t('promos.editor.targetPromo', 'Responding to Promo')}
              <span className="promo-editor__required" aria-hidden="true"> *</span>
            </label>
            {!targetPlayerId ? (
              <p className="promo-editor__hint">
                {t('promos.editor.selectPlayerFirst', 'Select a target wrestler above to see their promos.')}
              </p>
            ) : targetPromos.length === 0 ? (
              <p className="promo-editor__hint">
                {t('promos.editor.noTargetPromos', 'This wrestler has no promos yet. Pick a different wrestler or a different promo type.')}
              </p>
            ) : (
              <Select
                id="target-promo"
                label={t('promos.editor.targetPromo', 'Responding to Promo')}
                placeholder={t('promos.editor.selectPromo', '-- Select a promo --')}
                value={targetPromoId}
                onValueChange={setTargetPromoId}
                options={targetPromos.map((promo) => ({
                  value: promo.promoId,
                  label: promo.title || promo.content.slice(0, 60) + '...',
                }))}
              />
            )}
          </div>
        )}

        {showMatch && (
          <div className="promo-editor__field">
            <label className="promo-editor__label" htmlFor="match-select">
              {t('promos.editor.match', 'Match')}
            </label>
            <Select
              id="match-select"
              label={t('promos.editor.match', 'Match')}
              placeholder={t('promos.editor.selectMatch', '-- Select a match --')}
              value={matchId}
              onValueChange={setMatchId}
              options={matches.map((match) => ({
                value: match.matchId,
                label: `${match.matchFormat} - ${match.date}`,
              }))}
            />
          </div>
        )}

        {showRivalryPicker && (
          <div className="promo-editor__field">
            <label className="promo-editor__label" htmlFor="rivalry-select">
              {t('promos.editor.rivalry', 'Rivalry')}
              <span className="promo-editor__required" aria-hidden="true"> *</span>
            </label>
            {myRivalries.length === 0 ? (
              <p className="promo-editor__hint">
                {t(
                  'promos.editor.noRivalries',
                  "You're not in any rivalries yet. Have a GM start one, or pick a different promo type.",
                )}
              </p>
            ) : (
              <Select
                id="rivalry-select"
                label={t('promos.editor.rivalry', 'Rivalry')}
                placeholder={t('promos.editor.selectRivalry', '-- Select a rivalry --')}
                value={rivalryId}
                onValueChange={setRivalryId}
                options={rivalryOptions}
              />
            )}
          </div>
        )}

        {showChampionship && (
          <div className="promo-editor__field">
            <label className="promo-editor__label" htmlFor="championship-select">
              {t('promos.editor.championship', 'Championship')}
            </label>
            <Select
              id="championship-select"
              label={t('promos.editor.championship', 'Championship')}
              placeholder={t('promos.editor.selectChampionship', '-- Select a championship --')}
              value={championshipId}
              onValueChange={setChampionshipId}
              options={championships.map((champ) => ({ value: champ.championshipId, label: champ.name }))}
            />
          </div>
        )}

        {promoType === 'call-out' && (
          <div className="promo-editor__row">
            <div className="promo-editor__field">
              <label className="promo-editor__label" htmlFor="challenge-match-type">
                {t('promos.editor.matchType', 'Match Type')}
              </label>
              <Select
                id="challenge-match-type"
                label={t('promos.editor.matchType', 'Match Type')}
                placeholder={t('challenges.issue.selectMatchType', '-- Select match type --')}
                value={challengeMatchType}
                onValueChange={setChallengeMatchType}
                options={matchTypes.map((mt) => ({ value: mt.name, label: mt.name }))}
              />
            </div>
            <div className="promo-editor__field">
              <label className="promo-editor__label" htmlFor="challenge-stipulation">
                {t('promos.editor.stipulation', 'Stipulation')}
              </label>
              <Select
                id="challenge-stipulation"
                label={t('promos.editor.stipulation', 'Stipulation')}
                value={challengeStipulation}
                onValueChange={setChallengeStipulation}
                options={[
                  { value: '', label: t('common.none', 'None') },
                  ...stipulations.map((s) => ({ value: s.name, label: s.name })),
                ]}
              />
            </div>
          </div>
        )}

        {challengeTitles.length > 0 && (
          <div className="promo-editor__field">
            <label className="promo-editor__label" htmlFor="challenge-title">
              {t('challenges.issue.titleOnTheLine', 'Title on the line')}
            </label>
            <Select
              id="challenge-title"
              label={t('challenges.issue.titleOnTheLine', 'Title on the line')}
              value={stakedChampionshipId}
              onValueChange={setChampionshipId}
              options={[
                { value: '', label: t('challenges.issue.noTitle', 'No title') },
                ...challengeTitles.map((champ) => ({ value: champ.championshipId, label: champ.name })),
              ]}
            />
            <p className="promo-editor__hint">
              {t('challenges.issue.titleHint', 'Lists titles held by either side, and vacant titles.')}
            </p>
          </div>
        )}

        <div className="promo-editor__field">
          <label className="promo-editor__label" htmlFor="promo-title">
            {t('promos.editor.promoTitle', 'Title')}
            <span className="promo-editor__optional">({t('promos.editor.optional', 'optional')})</span>
          </label>
          <input
            id="promo-title"
            type="text"
            className="promo-editor__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('promos.editor.titlePlaceholder', 'Give your promo a catchy title...')}
            maxLength={100}
          />
        </div>

        <div className="promo-editor__field">
          <label className="promo-editor__label" htmlFor="promo-content">
            {t('promos.editor.content', 'Content')}
          </label>
          <textarea
            id="promo-content"
            className={`promo-editor__input promo-editor__textarea ${contentLength > 0 && !isContentValid ? 'promo-editor__input--invalid' : ''}`}
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT))}
            placeholder={t(
              'promos.editor.contentPlaceholder',
              'Drop your promo here... Use @WrestlerName to mention others.'
            )}
            rows={8}
          />
          <div className="promo-editor__counter">
            <span>{contentLength}/{MAX_CONTENT}</span>
            {contentLength < MIN_CONTENT && (
              <span className="promo-editor__counter-warning">
                {t('promos.editor.minChars', 'Minimum {{min}} characters', { min: MIN_CONTENT })}
              </span>
            )}
          </div>
        </div>

        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowPreview((prev) => !prev)}>
            {showPreview
              ? t('promos.editor.hidePreview', 'Hide Preview')
              : t('promos.editor.showPreview', 'Show Preview')}
          </Button>
        </div>

        {showPreview && (
          <section className="promo-editor__preview">
            <h2 className="promo-editor__label">{t('promos.editor.preview', 'Preview')}</h2>
            <PromoCard promo={previewPromo} />
          </section>
        )}

        {needsChallenge && !hasChallengeDetails && (
          <p className="promo-editor__hint">
            {t('promos.editor.challengeNeeds', 'Pick an opponent and a match type to issue the challenge.')}
          </p>
        )}

        <div className="promo-editor__actions">
          <Button variant="secondary" to="/promos">{t('common.cancel', 'Cancel')}</Button>
          <Button type="submit" disabled={!canSubmit} loading={submitting}>
            {submitting ? t('common.submitting', 'Submitting...') : t('promos.editor.submit', 'Drop the Mic')}
          </Button>
        </div>
      </form>
    </div>
  );
}
