import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { profileApi, tagTeamsApi } from '../../services/api';
import type { Player } from '../../types';
import type { TagTeamDetailResponse, TagTeam, TagTeamStatus } from '../../types/tagTeam';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import FormDots from '../ui/FormDots';
import Modal from '../ui/Modal';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/toastContext';
import CreateTagTeamModal from './CreateTagTeamModal';
import '../factions/groupUi.css';
import './MyTagTeam.css';

const STATUS_TONES: Record<TagTeamStatus, BadgeTone> = {
  active: 'win',
  dissolved: 'draw',
  pending_partner: 'warning',
  pending_admin: 'warning',
};

const STATUS_FALLBACKS: Record<TagTeamStatus, string> = {
  active: 'Active',
  dissolved: 'Dissolved',
  pending_partner: 'Pending Partner',
  pending_admin: 'Pending Admin',
};

export default function MyTagTeam() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Player | null>(null);
  const [tagTeam, setTagTeam] = useState<TagTeamDetailResponse | null>(null);
  const [pendingRequests, setPendingRequests] = useState<TagTeam[]>([]);
  const [pendingTeam, setPendingTeam] = useState<TagTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDissolveConfirm, setShowDissolveConfirm] = useState(false);
  const [dissolving, setDissolving] = useState(false);

  // Edit-identity form state (TTP-01)
  const [identityName, setIdentityName] = useState('');
  const [identityMyWrestler, setIdentityMyWrestler] = useState('');
  const [identityPartnerWrestler, setIdentityPartnerWrestler] = useState('');
  const [savingIdentity, setSavingIdentity] = useState(false);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const myProfile = await profileApi.getMyProfile(signal);
      setProfile(myProfile);

      if (myProfile.tagTeamId) {
        const detail = await tagTeamsApi.getById(myProfile.tagTeamId, signal);
        setTagTeam(detail);
        setPendingRequests([]);
        setPendingTeam(null);
      } else {
        setTagTeam(null);
        // Search for any tag team involving this player (pending states)
        try {
          const allTagTeams = await tagTeamsApi.getAll(undefined, signal);

          // Tag teams where user is player2 and needs to accept
          const incomingRequests = allTagTeams.filter(
            (tt) => tt.player2Id === myProfile.playerId && tt.status === 'pending_partner'
          );
          setPendingRequests(incomingRequests);

          // Tag teams where user is involved and awaiting admin approval,
          // or user created and waiting for partner response
          const myPending = allTagTeams.find(
            (tt) =>
              (tt.player1Id === myProfile.playerId || tt.player2Id === myProfile.playerId) &&
              (tt.status === 'pending_admin' ||
                (tt.status === 'pending_partner' && tt.player1Id === myProfile.playerId))
          );
          setPendingTeam(myPending || null);
        } catch {
          setPendingRequests([]);
          setPendingTeam(null);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : t('common.error', 'An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const controller = new AbortController();
    loadData(controller.signal);

    return () => controller.abort();
  }, [isAuthenticated, loadData]);

  // Seed the edit-identity form whenever the tag team or current player changes.
  useEffect(() => {
    if (!tagTeam || !profile) {
      setIdentityName('');
      setIdentityMyWrestler('');
      setIdentityPartnerWrestler('');
      return;
    }
    const isPlayer1 = tagTeam.player1Id === profile.playerId;
    const myOverride = isPlayer1 ? tagTeam.player1WrestlerName : tagTeam.player2WrestlerName;
    const partnerOverride = isPlayer1 ? tagTeam.player2WrestlerName : tagTeam.player1WrestlerName;
    const myFallback = isPlayer1 ? tagTeam.player1?.wrestlerName : tagTeam.player2?.wrestlerName;
    const partnerFallback = isPlayer1 ? tagTeam.player2?.wrestlerName : tagTeam.player1?.wrestlerName;
    setIdentityName(tagTeam.name ?? '');
    setIdentityMyWrestler(myOverride ?? myFallback ?? '');
    setIdentityPartnerWrestler(partnerOverride ?? partnerFallback ?? '');
  }, [tagTeam, profile]);

  const handleRespond = useCallback(async (tagTeamId: string, action: 'accept' | 'decline') => {
    try {
      await tagTeamsApi.respond(tagTeamId, action);
      showToast(
        action === 'accept'
          ? t('tagTeams.my.accepted', 'Tag team request accepted! Awaiting admin approval.')
          : t('tagTeams.my.declined', 'Tag team request declined.'),
        'success',
      );
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error', 'Failed'), 'error');
    }
  }, [t, loadData, showToast]);

  const handleDissolve = useCallback(async () => {
    if (!tagTeam) return;
    setDissolving(true);
    try {
      await tagTeamsApi.dissolve(tagTeam.tagTeamId);
      showToast(t('tagTeams.my.dissolved', 'Tag team has been dissolved.'), 'success');
      setShowDissolveConfirm(false);
      setTagTeam(null);
      const updatedProfile = await profileApi.getMyProfile();
      setProfile(updatedProfile);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error', 'Failed'), 'error');
    } finally {
      setDissolving(false);
    }
  }, [tagTeam, t, showToast]);

  const handleSaveIdentity = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!tagTeam || !profile) return;
    const isPlayer1 = tagTeam.player1Id === profile.playerId;
    const myField = isPlayer1 ? 'player1WrestlerName' : 'player2WrestlerName';
    const partnerField = isPlayer1 ? 'player2WrestlerName' : 'player1WrestlerName';

    setSavingIdentity(true);
    try {
      await tagTeamsApi.update(tagTeam.tagTeamId, {
        name: identityName,
        [myField]: identityMyWrestler,
        [partnerField]: identityPartnerWrestler,
      });
      showToast(t('tagTeams.my.identitySaved', 'Tag team identity saved.'), 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error', 'Failed'), 'error');
    } finally {
      setSavingIdentity(false);
    }
  }, [tagTeam, profile, identityName, identityMyWrestler, identityPartnerWrestler, t, loadData, showToast]);

  const header = <PageHeader title={t('tagTeams.my.title', 'My Tag Team')} />;

  if (!isAuthenticated) {
    return (
      <div className="group-page">
        {header}
        <EmptyState title={t('tagTeams.my.loginRequired', 'Please log in to manage your tag team.')} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="group-page">
        {header}
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="group-page">
        {header}
        <EmptyState
          title={t('common.error', 'Error')}
          description={error}
          actionLabel={t('common.retry', 'Retry')}
          onAction={() => loadData()}
        />
      </div>
    );
  }

  const partner = tagTeam && profile
    ? (tagTeam.player1Id === profile.playerId ? tagTeam.player2 : tagTeam.player1)
    : null;

  const respondButtons = (tagTeamId: string) => (
    <div className="my-tag-team__actions">
      <Button size="sm" onClick={() => handleRespond(tagTeamId, 'accept')}>
        {t('common.accept', 'Accept')}
      </Button>
      <Button size="sm" variant="secondary" onClick={() => handleRespond(tagTeamId, 'decline')}>
        {t('common.decline', 'Decline')}
      </Button>
    </div>
  );

  return (
    <div className="group-page">
      {header}

      {!tagTeam && !profile?.tagTeamId && (
        <>
          {pendingTeam ? (
            <div className="group-person">
              <Avatar src={pendingTeam.imageUrl} name={pendingTeam.name} size="lg" />
              <span className="group-person__text my-tag-team__pending">
                <span className="my-tag-team__name">{pendingTeam.name}</span>
                <Badge tone="warning">
                  {pendingTeam.status === 'pending_admin'
                    ? t('tagTeams.my.awaitingAdmin', 'Awaiting Admin Approval')
                    : t('tagTeams.my.waitingForPartner', 'Waiting for Partner')}
                </Badge>
              </span>
            </div>
          ) : (
            <div className="my-tag-team__start">
              <Link2 aria-hidden="true" size={32} className="my-tag-team__icon" />
              <h2 className="my-tag-team__start-title">{t('tagTeams.my.noTeam', 'You are not in a tag team')}</h2>
              <p className="group-empty">
                {t('tagTeams.my.noTeamDesc', 'Create a tag team by choosing a partner, or wait for someone to send you a request.')}
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                {t('tagTeams.my.createTeam', 'Create a Tag Team')}
              </Button>
            </div>
          )}

          {pendingRequests.length > 0 && (
            <section className="group-section">
              <h2 className="group-heading">{t('tagTeams.my.pendingRequests', 'Pending Tag Team Requests')}</h2>
              <ul className="group-list">
                {pendingRequests.map((request) => (
                  <li key={request.tagTeamId} className="my-tag-team__request">
                    <span className="group-person__text">
                      <span className="group-person__name">{request.name}</span>
                      <span className="group-muted">
                        {t('tagTeams.my.requestFrom', 'Request from another player')}
                      </span>
                    </span>
                    {respondButtons(request.tagTeamId)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {tagTeam && (
        <>
          <div className="group-person">
            <Avatar src={tagTeam.imageUrl} name={tagTeam.name} size="xl" ring="pink" />
            <span className="group-person__text my-tag-team__pending">
              <Link to={`/tag-teams/${tagTeam.tagTeamId}`} className="my-tag-team__name">{tagTeam.name}</Link>
              <Badge tone={STATUS_TONES[tagTeam.status]}>
                {t(`tagTeams.statusLabel.${tagTeam.status}`, STATUS_FALLBACKS[tagTeam.status])}
              </Badge>
            </span>
          </div>

          <dl className="group-stats">
            <div>
              <dt>{t('tagTeams.my.record', 'Record')}</dt>
              <dd>{tagTeam.wins}-{tagTeam.losses}-{tagTeam.draws}</dd>
            </div>
            {tagTeam.standings && (
              <div>
                <dt>{t('tagTeams.my.winPct', 'Win %')}</dt>
                <dd>{tagTeam.standings.winPercentage.toFixed(1)}%</dd>
              </div>
            )}
            {tagTeam.standings?.currentStreak?.count > 0 && (
              <div>
                <dt>{t('tagTeams.my.streak', 'Streak')}</dt>
                <dd>{tagTeam.standings.currentStreak.count}{tagTeam.standings.currentStreak.type}</dd>
              </div>
            )}
            {tagTeam.standings?.recentForm.length > 0 && (
              <div>
                <dt>{t('tagTeams.my.recentForm', 'Form')}</dt>
                <dd><FormDots results={tagTeam.standings.recentForm} /></dd>
              </div>
            )}
          </dl>

          {partner && (
            <section className="group-section">
              <h2 className="group-heading">{t('tagTeams.my.partner', 'Your Partner')}</h2>
              <div className="group-person">
                <Avatar src={partner.imageUrl} name={partner.wrestlerName} size="lg" />
                <span className="group-person__text">
                  <span className="group-person__name">{partner.wrestlerName}</span>
                  <span className="group-muted">{partner.playerName}</span>
                  {partner.psnId && <span className="group-muted">PSN: {partner.psnId}</span>}
                </span>
              </div>
            </section>
          )}

          {tagTeam.status === 'active' && (
            <form className="group-section my-tag-team__identity" onSubmit={handleSaveIdentity}>
              <h2 className="group-heading">{t('tagTeams.my.editIdentity', 'Edit Team Identity')}</h2>
              <label className="group-field">
                <span className="group-field__label">{t('tagTeams.my.teamName', 'Tag Team Name')}</span>
                <input
                  type="text"
                  value={identityName}
                  onChange={(event) => setIdentityName(event.target.value)}
                  disabled={savingIdentity}
                />
              </label>
              <label className="group-field">
                <span className="group-field__label">{t('tagTeams.my.yourWrestler', 'Your wrestler in this team')}</span>
                <input
                  type="text"
                  value={identityMyWrestler}
                  onChange={(event) => setIdentityMyWrestler(event.target.value)}
                  disabled={savingIdentity}
                />
              </label>
              <label className="group-field">
                <span className="group-field__label">{t('tagTeams.my.partnerWrestler', "Partner's wrestler in this team")}</span>
                <input
                  type="text"
                  value={identityPartnerWrestler}
                  onChange={(event) => setIdentityPartnerWrestler(event.target.value)}
                  disabled={savingIdentity}
                />
              </label>
              <div>
                <Button type="submit" loading={savingIdentity}>
                  {savingIdentity ? t('common.saving', 'Saving...') : t('tagTeams.my.saveIdentity', 'Save')}
                </Button>
              </div>
            </form>
          )}

          {tagTeam.status === 'active' && (
            <div>
              <Button variant="danger" onClick={() => setShowDissolveConfirm(true)}>
                {t('tagTeams.my.dissolve', 'Dissolve Tag Team')}
              </Button>
            </div>
          )}

          {tagTeam.status === 'pending_partner' && profile && tagTeam.player2Id === profile.playerId && (
            <section className="group-section">
              <p className="group-empty">{t('tagTeams.my.partnerRequest', 'You have been invited to form this tag team.')}</p>
              {respondButtons(tagTeam.tagTeamId)}
            </section>
          )}
        </>
      )}

      <CreateTagTeamModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => loadData()}
      />

      <Modal
        open={showDissolveConfirm}
        size="sm"
        title={t('tagTeams.my.dissolve', 'Dissolve Tag Team')}
        onClose={() => { if (!dissolving) setShowDissolveConfirm(false); }}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowDissolveConfirm(false)} disabled={dissolving}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="danger" onClick={handleDissolve} loading={dissolving}>
              {dissolving ? t('common.processing', 'Processing...') : t('tagTeams.my.dissolve', 'Dissolve Tag Team')}
            </Button>
          </>
        )}
      >
        <p className="group-empty">
          {t('tagTeams.my.dissolveConfirm', 'Are you sure you want to dissolve this tag team? This cannot be undone.')}
        </p>
      </Modal>
    </div>
  );
}
