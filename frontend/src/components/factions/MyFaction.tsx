import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { profileApi, factionsApi } from '../../services/api';
import type { Player } from '../../types';
import type { StableDetailResponse, StableInvitationWithDetails } from '../../types/stable';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import CreateFactionModal from './CreateFactionModal';
import InviteToFactionModal from './InviteToFactionModal';
import './MyFaction.css';

export default function MyFaction() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<Player | null>(null);
  const [faction, setFaction] = useState<StableDetailResponse | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<StableInvitationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [disbanding, setDisbanding] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const myProfile = await profileApi.getMyProfile(signal);
      setProfile(myProfile);

      // If user has a stable, fetch stable details and invitations
      if (myProfile.stableId) {
        const [stableDetail, invitations] = await Promise.all([
          factionsApi.getById(myProfile.stableId, signal),
          factionsApi.getInvitations(myProfile.stableId, signal).catch(() => [] as StableInvitationWithDetails[]),
        ]);
        setFaction(stableDetail);
        setPendingInvitations(invitations.filter((inv) => inv.status === 'pending'));
      } else {
        setFaction(null);
        setPendingInvitations([]);

        // Check all stables for pending invitations sent to this player
        // Since there's no direct "my invitations" endpoint, we look through all stables
        // This is a best-effort approach; a dedicated endpoint would be more efficient
        try {
          const allStables = await factionsApi.getAll(undefined, signal);
          const myInvitations: StableInvitationWithDetails[] = [];
          for (const s of allStables) {
            try {
              const invs = await factionsApi.getInvitations(s.stableId, signal);
              const pending = invs.filter(
                (inv) => inv.invitedPlayerId === myProfile.playerId && inv.status === 'pending'
              );
              myInvitations.push(...pending);
            } catch {
              // Skip stables we can't access invitations for
            }
          }
          setPendingInvitations(myInvitations);
        } catch {
          // Non-critical: invitations loading failed
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

  const handleDisband = useCallback(async () => {
    if (!faction) return;
    const confirmed = window.confirm(
      t('factions.my.disbandConfirm', 'Are you sure you want to disband this stable? This cannot be undone.')
    );
    if (!confirmed) return;

    setDisbanding(true);
    try {
      await factionsApi.disband(faction.stableId);
      setActionFeedback(t('factions.my.disbanded', 'Stable has been disbanded.'));
      setFaction(null);
      // Refresh profile
      const updatedProfile = await profileApi.getMyProfile();
      setProfile(updatedProfile);
    } catch (err) {
      setActionFeedback(
        `Error: ${err instanceof Error ? err.message : t('common.error', 'Failed')}`
      );
    } finally {
      setDisbanding(false);
      setTimeout(() => setActionFeedback(null), 3000);
    }
  }, [faction, t]);

  const handleLeave = useCallback(async () => {
    if (!faction || !profile) return;
    const confirmed = window.confirm(
      t('factions.my.leaveConfirm', 'Are you sure you want to leave this stable?')
    );
    if (!confirmed) return;

    setLeaving(true);
    try {
      await factionsApi.leave(faction.stableId, profile.playerId);
      setActionFeedback(t('factions.my.left', 'You have left the faction.'));
      setFaction(null);
      const updatedProfile = await profileApi.getMyProfile();
      setProfile(updatedProfile);
    } catch (err) {
      setActionFeedback(
        `Error: ${err instanceof Error ? err.message : t('common.error', 'Failed')}`
      );
    } finally {
      setLeaving(false);
      setTimeout(() => setActionFeedback(null), 3000);
    }
  }, [faction, profile, t]);

  const handleRespondToInvitation = useCallback(async (
    stableId: string,
    invitationId: string,
    action: 'accept' | 'decline'
  ) => {
    try {
      await factionsApi.respondToInvitation(stableId, invitationId, action);
      setActionFeedback(
        action === 'accept'
          ? t('factions.my.invitationAccepted', 'Invitation accepted! You have joined the faction.')
          : t('factions.my.invitationDeclined', 'Invitation declined.')
      );
      // Refresh data
      await loadData();
    } catch (err) {
      setActionFeedback(
        `Error: ${err instanceof Error ? err.message : t('common.error', 'Failed')}`
      );
    }
    setTimeout(() => setActionFeedback(null), 3000);
  }, [t, loadData]);

  const handleCreated = useCallback(() => {
    loadData();
  }, [loadData]);

  const handleInvited = useCallback(() => {
    if (faction) {
      factionsApi.getInvitations(faction.stableId)
        .then((invs) => setPendingInvitations(invs.filter((inv) => inv.status === 'pending')))
        .catch(() => { /* ignore */ });
    }
  }, [faction]);

  if (!isAuthenticated) {
    return (
      <div className="my-faction">
        <div className="my-faction__empty">
          <p>{t('factions.my.loginRequired', 'Please log in to manage your faction.')}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="my-faction">
        <div className="my-faction__loading">{t('common.loading', 'Loading...')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-faction">
        <div className="my-faction__error">
          <p>{error}</p>
          <button onClick={() => loadData()} className="btn-primary">
            {t('common.retry', 'Retry')}
          </button>
        </div>
      </div>
    );
  }

  const isLeader = faction && profile && faction.leaderId === profile.playerId;
  const isApprovedOrActive = faction && (faction.status === 'approved' || faction.status === 'active');

  return (
    <div className="my-faction">
      <div className="my-faction__header">
        <h2>{t('factions.my.title', 'My Stable')}</h2>
      </div>

      {actionFeedback && (
        <div className="my-faction__feedback">{actionFeedback}</div>
      )}

      {!faction && !profile?.stableId ? (
        /* No stable - show create button and pending invitations */
        <div className="my-faction__no-faction">
          <div className="my-faction__no-faction-info">
            <h3>{t('factions.my.noStable', 'You are not in a stable')}</h3>
            <p>{t('factions.my.noStableDesc', 'Create your own stable or wait for an invitation from a stable leader.')}</p>
            <button
              className="btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              {t('factions.my.createStable', 'Create a Stable')}
            </button>
          </div>

          {pendingInvitations.length > 0 && (
            <div className="my-faction__invitations">
              <h3>{t('factions.my.pendingInvitations', 'Pending Invitations')}</h3>
              <div className="my-faction__invitations-list">
                {pendingInvitations.map((inv) => (
                  <div key={inv.invitationId} className="my-faction__invitation-item">
                    <div className="my-faction__invitation-info">
                      <span className="my-faction__invitation-faction">
                        {inv.stableName}
                      </span>
                      {inv.invitedByPlayerName && (
                        <span className="my-faction__invitation-from">
                          {t('factions.my.invitedBy', 'Invited by {{name}}', { name: inv.invitedByPlayerName })}
                        </span>
                      )}
                      {inv.message && (
                        <span className="my-faction__invitation-message">
                          &ldquo;{inv.message}&rdquo;
                        </span>
                      )}
                    </div>
                    <div className="my-faction__invitation-actions">
                      <button
                        className="btn-sm-accept"
                        onClick={() => handleRespondToInvitation(inv.stableId, inv.invitationId, 'accept')}
                      >
                        {t('common.accept', 'Accept')}
                      </button>
                      <button
                        className="btn-sm-decline"
                        onClick={() => handleRespondToInvitation(inv.stableId, inv.invitationId, 'decline')}
                      >
                        {t('common.decline', 'Decline')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : faction ? (
        /* Has a stable - show details */
        <div className="my-faction__detail">
          <div className="my-faction__info-card">
            {faction.imageUrl && (
              <div className="my-faction__image-wrapper">
                <img
                  src={resolveImageSrc(faction.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                  onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                  alt={faction.name}
                  className="my-faction__image"
                />
              </div>
            )}
            <div className="my-faction__info">
              <h3 className="my-faction__name">
                <Link to={`/factions/${faction.stableId}`}>{faction.name}</Link>
              </h3>
              <span className={`my-faction__status my-faction__status--${faction.status}`}>
                {t(`factions.status.${faction.status}`, faction.status)}
              </span>
              <div className="my-faction__stats">
                <span className="my-faction__stat my-faction__stat--wins">
                  {faction.wins}{t('factions.wAbbrev', 'W')}
                </span>
                <span className="my-faction__stat my-faction__stat--losses">
                  {faction.losses}{t('factions.lAbbrev', 'L')}
                </span>
                <span className="my-faction__stat my-faction__stat--draws">
                  {faction.draws}{t('factions.dAbbrev', 'D')}
                </span>
              </div>
            </div>
          </div>

          {/* Members list */}
          <div className="my-faction__members">
            <h4>{t('factions.my.members', 'Members')}</h4>
            <div className="my-faction__members-list">
              {faction.members.map((member) => (
                <div key={member.playerId} className="my-faction__member-item">
                  <div className="my-faction__member-avatar">
                    <img
                      src={resolveImageSrc(member.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                      onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                      alt={member.wrestlerName}
                    />
                  </div>
                  <div className="my-faction__member-info">
                    <span className="my-faction__member-wrestler">
                      {member.wrestlerName}
                    </span>
                    <span className="my-faction__member-player">
                      {member.playerName}
                    </span>
                    {member.psnId && (
                      <span className="my-faction__member-psn">PSN: {member.psnId}</span>
                    )}
                  </div>
                  {member.playerId === faction.leaderId && (
                    <span className="my-faction__member-leader-badge">
                      {t('factions.my.leader', 'Leader')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Leader actions */}
          {isLeader && (
            <div className="my-faction__leader-actions">
              {isApprovedOrActive && (
                <button
                  className="btn-primary"
                  onClick={() => setShowInviteModal(true)}
                >
                  {t('factions.my.invitePlayer', 'Invite Player')}
                </button>
              )}
              <button
                className="btn-danger"
                onClick={handleDisband}
                disabled={disbanding}
              >
                {disbanding
                  ? t('common.processing', 'Processing...')
                  : t('factions.my.disband', 'Disband Stable')}
              </button>
            </div>
          )}

          {/* Member actions (non-leader) */}
          {!isLeader && isApprovedOrActive && (
            <div className="my-faction__member-actions">
              <button
                className="btn-danger"
                onClick={handleLeave}
                disabled={leaving}
              >
                {leaving
                  ? t('common.processing', 'Processing...')
                  : t('factions.my.leave', 'Leave Stable')}
              </button>
            </div>
          )}

          {/* Pending invitations sent by leader */}
          {isLeader && pendingInvitations.length > 0 && (
            <div className="my-faction__sent-invitations">
              <h4>{t('factions.my.sentInvitations', 'Pending Invitations')}</h4>
              <div className="my-faction__sent-invitations-list">
                {pendingInvitations.map((inv) => (
                  <div key={inv.invitationId} className="my-faction__sent-invitation-item">
                    <span className="my-faction__sent-invitation-player">
                      {inv.invitedPlayerName || inv.invitedPlayerId}
                    </span>
                    <span className="my-faction__sent-invitation-status">
                      {t('factions.invitationStatus.pending', 'Pending')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      <CreateFactionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />

      {faction && (
        <InviteToFactionModal
          isOpen={showInviteModal}
          stableId={faction.stableId}
          currentMemberIds={faction.memberIds}
          onClose={() => setShowInviteModal(false)}
          onInvited={handleInvited}
        />
      )}
    </div>
  );
}
