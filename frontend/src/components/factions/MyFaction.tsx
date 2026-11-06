import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { factionsApi, profileApi } from '../../services/api';
import type { Player } from '../../types';
import type { StableInvitationWithDetails } from '../../types/stable';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/toastContext';
import CreateFactionModal from './CreateFactionModal';
import FactionsHubTabs from './FactionsHubTabs';
import './groupUi.css';
import './MyFaction.css';

/**
 * Create and invitation surface for players with no faction. Members are sent
 * to the faction page, which holds all management.
 */
export default function MyFaction() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Player | null>(null);
  const [invitations, setInvitations] = useState<StableInvitationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const myProfile = await profileApi.getMyProfile(signal);
      setProfile(myProfile);
      if (myProfile.stableId) return;

      // There is no "my invitations" endpoint, so this checks each faction.
      try {
        const allFactions = await factionsApi.getAll(undefined, signal);
        const perFaction = await Promise.all(allFactions.map(async (faction) => {
          try {
            return await factionsApi.getInvitations(faction.stableId, signal);
          } catch {
            return [] as StableInvitationWithDetails[];
          }
        }));
        setInvitations(perFaction.flat().filter((invitation) => (
          invitation.invitedPlayerId === myProfile.playerId && invitation.status === 'pending'
        )));
      } catch {
        setInvitations([]);
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

  const handleRespond = async (invitation: StableInvitationWithDetails, action: 'accept' | 'decline') => {
    setRespondingTo(invitation.invitationId);
    try {
      await factionsApi.respondToInvitation(invitation.stableId, invitation.invitationId, action);
      showToast(
        action === 'accept'
          ? t('factions.my.invitationAccepted', 'Invitation accepted! You have joined the faction.')
          : t('factions.my.invitationDeclined', 'Invitation declined.'),
        'success',
      );
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('common.error', 'Failed'), 'error');
    } finally {
      setRespondingTo(null);
    }
  };

  const header = (
    <>
      <PageHeader title={t('factions.my.title', 'My Faction')} />
      <FactionsHubTabs />
    </>
  );

  if (!isAuthenticated) {
    return (
      <div className="group-page">
        {header}
        <EmptyState title={t('factions.my.loginRequired', 'Please log in to manage your faction.')} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="group-page">
        {header}
        <Skeleton variant="block" count={2} />
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

  if (profile?.stableId) {
    return <Navigate to={`/factions/${profile.stableId}`} replace />;
  }

  return (
    <div className="group-page">
      {header}

      <div className="my-faction__start">
        <Flag aria-hidden="true" size={32} className="my-faction__icon" />
        <h2 className="my-faction__title">{t('factions.my.noStable', 'You are not in a faction')}</h2>
        <p className="group-empty">
          {t('factions.my.noStableDesc', 'Create your own faction or wait for an invitation from a faction leader.')}
        </p>
        <Button onClick={() => setShowCreateModal(true)}>
          {t('factions.my.createStable', 'Create a Faction')}
        </Button>
      </div>

      {invitations.length > 0 && (
        <section className="group-section">
          <h2 className="group-heading">{t('factions.my.pendingInvitations', 'Pending Invitations')}</h2>
          <ul className="group-list">
            {invitations.map((invitation) => (
              <li key={invitation.invitationId} className="my-faction__invitation">
                <div className="group-person__text">
                  <span className="group-person__name">{invitation.stableName}</span>
                  {invitation.invitedByPlayerName && (
                    <span className="group-muted">
                      {t('factions.my.invitedBy', 'Invited by {{name}}', { name: invitation.invitedByPlayerName })}
                    </span>
                  )}
                  {invitation.message && <q className="my-faction__message">{invitation.message}</q>}
                </div>
                <div className="my-faction__actions">
                  <Button
                    size="sm"
                    disabled={respondingTo !== null}
                    onClick={() => handleRespond(invitation, 'accept')}
                  >
                    {t('common.accept', 'Accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={respondingTo !== null}
                    onClick={() => handleRespond(invitation, 'decline')}
                  >
                    {t('common.decline', 'Decline')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CreateFactionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => loadData()}
      />
    </div>
  );
}
