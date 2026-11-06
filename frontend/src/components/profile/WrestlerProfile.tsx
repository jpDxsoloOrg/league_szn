import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, UserRound } from 'lucide-react';
import { divisionsApi, isApiError, overallsApi, profileApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { WRESTLER_NAME_ENTRY_MODE } from '../../config/wrestlerNameEntry';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import EmbeddedPlayerStats from '../statistics/EmbeddedPlayerStats';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import type { Division, Player, WrestlerOverall } from '../../types';
import MovesetSection from './MovesetSection';
import ProfileEditForm from './ProfileEditForm';
import ProfileHero from './ProfileHero';
import ProfileRequests from './ProfileRequests';
import RecordSummary from './RecordSummary';
import SeasonRecords from './SeasonRecords';
import type { SeasonRecord } from './profileRecord';
import '../MeForms.css';
import './Profile.css';

interface PlayerProfile extends Player {
  seasonRecords?: SeasonRecord[];
}

type ProfileTab = 'overview' | 'requests' | 'stats';

export default function WrestlerProfile() {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const { features } = useSiteConfig();
  const location = useLocation();
  const navigate = useNavigate();
  // Set by the links that promise the form, so one tap gets there.
  const editorRequested = (location.state as { editProfile?: boolean } | null)?.editProfile === true;
  const openEditorOnLoad = useRef(editorRequested);
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [overall, setOverall] = useState<WrestlerOverall | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noPlayerRecord, setNoPlayerRecord] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<ProfileTab>('overview');

  // The request is used up once read. Left in history it would reopen the form
  // on reload, and any later navigation here would change it and reset the page.
  useEffect(() => {
    if (editorRequested) navigate(location.pathname + location.search, { replace: true, state: null });
  }, [editorRequested, location.pathname, location.search, navigate]);

  useEffect(() => {
    const loadOverall = async () => {
      try {
        setOverall(await overallsApi.getMyOverall());
      } catch {
        // A 404 means no overall has been submitted yet.
      }
    };
    const loadProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        setPlayer(await profileApi.getMyProfile());
      } catch (err) {
        if (isApiError(err, 404)) {
          setNoPlayerRecord(true);
        } else {
          setError(err instanceof Error ? err.message : null);
        }
        return;
      } finally {
        setLoading(false);
      }
      // After the profile: an account with no player has no overall to fetch,
      // and the form reads the overall when it opens.
      await loadOverall();
      if (openEditorOnLoad.current) setEditing(true);
    };
    const loadDivisions = async () => {
      try {
        setDivisions(await divisionsApi.getAll());
      } catch {
        // The division line and transfer choices stay empty.
      }
    };
    void loadProfile();
    void loadDivisions();
  }, []);

  const startEditing = () => {
    setEditing(true);
    setError(null);
    setSuccess(null);
  };

  const handleSaved = async (updated: Player, savedOverall: WrestlerOverall | null) => {
    const becameVisible =
      Boolean(player) && isNeedsWrestler(player?.currentWrestler) && !isNeedsWrestler(updated.currentWrestler);
    // The save response has no season records, so keep the ones already loaded.
    setPlayer((prev) => ({ ...updated, seasonRecords: prev?.seasonRecords }));
    setOverall(savedOverall);
    setEditing(false);
    setSuccess(becameVisible ? t('me.setup.nowVisible') : t('me.profile.updated'));
    await refreshProfile();
  };

  if (loading) {
    return (
      <div className="profile-page">
        <Skeleton variant="block" count={4} />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="profile-page">
        <p className="me-alert me-alert--error" role="alert">
          {noPlayerRecord ? t('me.profile.noPlayerRecord') : error ?? t('me.profile.loadFailed')}
        </p>
        <EmptyState
          icon={<UserRound aria-hidden="true" size={32} />}
          title={t('me.profile.noProfileTitle')}
          description={t('me.profile.noProfileBody')}
        />
      </div>
    );
  }

  // In text mode there is no FK to key off, so the prompt follows the name.
  const needsWrestlerName = WRESTLER_NAME_ENTRY_MODE === 'text'
    ? isNeedsWrestler(player.currentWrestler)
    : !player.currentWrestlerId;
  const divisionName = divisions.find((division) => division.divisionId === player.divisionId)?.name;
  const statisticsTab = Boolean(features.statistics && player.playerId);

  return (
    <div className="profile-page">
      {error && <p className="me-alert me-alert--error" role="alert">{error}</p>}
      {success && <p className="me-alert me-alert--success" role="status">{success}</p>}

      {needsWrestlerName && !editing && (
        <div className="me-alert me-alert--warn profile-hidden-notice" role="status">
          <div>
            <strong>{t('me.setup.hiddenTitle')}</strong>
            <p>{t('me.setup.hiddenNotice')}</p>
          </div>
          <Button onClick={startEditing}>{t('me.setup.enterName')}</Button>
        </div>
      )}

      <ProfileHero
        player={player}
        details={divisionName ? [{ label: t('publicProfile.division'), value: divisionName }] : []}
        actions={!editing && (
          <Button variant="secondary" icon={<Pencil aria-hidden="true" size={16} />} onClick={startEditing}>
            {t('me.profile.edit')}
          </Button>
        )}
      />

      {editing ? (
        <ProfileEditForm
          player={player}
          overall={overall}
          onCancel={() => setEditing(false)}
          onSaved={handleSaved}
        />
      ) : (
        <>
          <Tabs
            label={t('me.profile.tabsLabel')}
            value={tab}
            onValueChange={(value) => setTab(value as ProfileTab)}
            items={[
              { value: 'overview', label: t('me.profile.tabOverview') },
              { value: 'requests', label: t('me.profile.tabRequests') },
              ...(statisticsTab ? [{ value: 'stats', label: t('me.profile.tabStats') }] : []),
            ]}
          />

          <div hidden={tab !== 'overview'}>
            <RecordSummary record={player} />
            <MovesetSection player={player} showEmpty />
            {overall && (
              <section className="profile-section" aria-labelledby="profile-overalls-title">
                <h2 className="profile-section__title" id="profile-overalls-title">{t('overalls.profile.title')}</h2>
                <Card>
                  <dl className="profile-figures">
                    <div>
                      <dt>{t('overalls.admin.mainOverall')}</dt>
                      <dd>{overall.mainOverall}</dd>
                    </div>
                    {overall.alternateOverall !== undefined && (
                      <div>
                        <dt>{t('overalls.admin.altOverall')}</dt>
                        <dd>{overall.alternateOverall}</dd>
                      </div>
                    )}
                  </dl>
                </Card>
              </section>
            )}
            <SeasonRecords seasons={player.seasonRecords ?? []} />
          </div>

          {/* Stays mounted so a half-written request survives a tab switch. */}
          <div hidden={tab !== 'requests'}>
            <ProfileRequests player={player} divisions={divisions} />
          </div>

          {statisticsTab && tab === 'stats' && <EmbeddedPlayerStats playerId={player.playerId} />}
        </>
      )}
    </div>
  );
}
