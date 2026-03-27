import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { profileApi, stablesApi } from '../../services/api';
import type { Player } from '../../types';
import type { StableDetailResponse, StableInvitationWithDetails } from '../../types/stable';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import CreateStableModal from './CreateStableModal';
import InviteToStableModal from './InviteToStableModal';
import './MyStable.css';

export default function MyStable() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<Player | null>(null);
  const [stable, setStable] = useState<StableDetailResponse | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<StableInvitationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [disbanding, setDisbanding] = useState(false);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const myProfile = await profileApi.getMyProfile(signal);
      setProfile(myProfile);

      // If user has a stable, fetch stable details and invitations
      if (myProfile.stableId) {
        const [stableDetail, invitations] = await Promise.all([
          stablesApi.getById(myProfile.stableId, signal),
          stablesApi.getInvitations(myProfile.stableId, signal).catch(() => [] as StableInvitationWithDetails[]),
        ]);
        setStable(stableDetail);
        setPendingInvitations(invitations.filter((inv) => inv.status === 'pending'));
      } else {
        setStable(null);
        setPendingInvitations([]);

        // Check all stables for pending invitations sent to this player
        // Since there's no direct "my invitations" endpoint, we look through all stables
        // This is a best-effort approach; a dedicated endpoint would be more efficient
        try {
          const allStables = await stablesApi.getAll(undefined, signal);
          const myInvitations: StableInvitationWithDetails[] = [];
          for (const s of allStables) {
            try {
              const invs = await stablesApi.getInvitations(s.stableId, signal);
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
    if (!stable) return;
    const confirmed = window.confirm(
      t('stables.my.disbandConfirm', 'Are you sure you want to disband this stable? This cannot be undone.')
    );
    if (!confirmed) return;

    setDisbanding(true);
    try {
      await stablesApi.disband(stable.stableId);
      setActionFeedback(t('stables.my.disbanded', 'Stable has been disbanded.'));
      setStable(null);
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
  }, [stable, t]);

  const handleRespondToInvitation = useCallback(async (
    stableId: string,
    invitationId: string,
    action: 'accept' | 'decline'
  ) => {
    try {
      await stablesApi.respondToInvitation(stableId, invitationId, action);
      setActionFeedback(
        action === 'accept'
          ? t('stables.my.invitationAccepted', 'Invitation accepted! You have joined the stable.')
          : t('stables.my.invitationDeclined', 'Invitation declined.')
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
    if (stable) {
      stablesApi.getInvitations(stable.stableId)
        .then((invs) => setPendingInvitations(invs.filter((inv) => inv.status === 'pending')))
        .catch(() => { /* ignore */ });
    }
  }, [stable]);

  if (!isAuthenticated) {
    return (
      <div className="my-stable">
        <div className="my-stable__empty">
          <p>{t('stables.my.loginRequired', 'Please log in to manage your stable.')}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="my-stable">
        <div className="my-stable__loading">{t('common.loading', 'Loading...')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-stable">
        <div className="my-stable__error">
          <p>{error}</p>
          <button onClick={() => loadData()} className="btn-primary">
            {t('common.retry', 'Retry')}
          </button>
        </div>
      </div>
    );
  }

  const isLeader = stable && profile && stable.leaderId === profile.playerId;
  const isApprovedOrActive = stable && (stable.status === 'approved' || stable.status === 'active');

  return (
    <div className="my-stable">
      <div className="my-stable__header">
        <h2>{t('stables.my.title', 'My Stable')}</h2>
      </div>

      {actionFeedback && (
        <div className="my-stable__feedback">{actionFeedback}</div>
      )}

      {!stable && !profile?.stableId ? (
        /* No stable - show create button and pending invitations */
        <div className="my-stable__no-stable">
          <div className="my-stable__no-stable-info">
            <h3>{t('stables.my.noStable', 'You are not in a stable')}</h3>
            <p>{t('stables.my.noStableDesc', 'Create your own stable or wait for an invitation from a stable leader.')}</p>
            <button
              className="btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              {t('stables.my.createStable', 'Create a Stable')}
            </button>
          </div>

          {pendingInvitations.length > 0 && (
            <div className="my-stable__invitations">
              <h3>{t('stables.my.pendingInvitations', 'Pending Invitations')}</h3>
              <div className="my-stable__invitations-list">
                {pendingInvitations.map((inv) => (
                  <div key={inv.invitationId} className="my-stable__invitation-item">
                    <div className="my-stable__invitation-info">
                      <span className="my-stable__invitation-stable">
                        {inv.stableName}
                      </span>
                      {inv.invitedByPlayerName && (
                        <span className="my-stable__invitation-from">
                          {t('stables.my.invitedBy', 'Invited by {{name}}', { name: inv.invitedByPlayerName })}
                        </span>
                      )}
                      {inv.message && (
                        <span className="my-stable__invitation-message">
                          &ldquo;{inv.message}&rdquo;
                        </span>
                      )}
                    </div>
                    <div className="my-stable__invitation-actions">
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
      ) : stable ? (
        /* Has a stable - show details */
        <div className="my-stable__detail">
          <div className="my-stable__info-card">
            {stable.imageUrl && (
              <div className="my-stable__image-wrapper">
                <img
                  src={resolveImageSrc(stable.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                  onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                  alt={stable.name}
                  className="my-stable__image"
                />
              </div>
            )}
            <div className="my-stable__info">
              <h3 className="my-stable__name">
                <Link to={`/stables/${stable.stableId}`}>{stable.name}</Link>
              </h3>
              <span className={`my-stable__status my-stable__status--${stable.status}`}>
                {t(`stables.status.${stable.status}`, stable.status)}
              </span>
              <div className="my-stable__stats">
                <span className="my-stable__stat my-stable__stat--wins">
                  {stable.wins}{t('stables.wAbbrev', 'W')}
                </span>
                <span className="my-stable__stat my-stable__stat--losses">
                  {stable.losses}{t('stables.lAbbrev', 'L')}
                </span>
                <span className="my-stable__stat my-stable__stat--draws">
                  {stable.draws}{t('stables.dAbbrev', 'D')}
                </span>
              </div>
            </div>
          </div>

          {/* Members list */}
          <div className="my-stable__members">
            <h4>{t('stables.my.members', 'Members')}</h4>
            <div className="my-stable__members-list">
              {stable.members.map((member) => (
                <div key={member.playerId} className="my-stable__member-item">
                  <div className="my-stable__member-avatar">
                    <img
                      src={resolveImageSrc(member.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                      onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                      alt={member.wrestlerName}
                    />
                  </div>
                  <div className="my-stable__member-info">
                    <span className="my-stable__member-wrestler">
                      {member.wrestlerName}
                    </span>
                    <span className="my-stable__member-player">
                      {member.playerName}
                    </span>
                    {member.psnId && (
                      <span className="my-stable__member-psn">PSN: {member.psnId}</span>
                    )}
                  </div>
                  {member.playerId === stable.leaderId && (
                    <span className="my-stable__member-leader-badge">
                      {t('stables.my.leader', 'Leader')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Leader actions */}
          {isLeader && (
            <div className="my-stable__leader-actions">
              {isApprovedOrActive && (
                <button
                  className="btn-primary"
                  onClick={() => setShowInviteModal(true)}
                >
                  {t('stables.my.invitePlayer', 'Invite Player')}
                </button>
              )}
              <button
                className="btn-danger"
                onClick={handleDisband}
                disabled={disbanding}
              >
                {disbanding
                  ? t('common.processing', 'Processing...')
                  : t('stables.my.disband', 'Disband Stable')}
              </button>
            </div>
          )}

          {/* Pending invitations sent by leader */}
          {isLeader && pendingInvitations.length > 0 && (
            <div className="my-stable__sent-invitations">
              <h4>{t('stables.my.sentInvitations', 'Pending Invitations')}</h4>
              <div className="my-stable__sent-invitations-list">
                {pendingInvitations.map((inv) => (
                  <div key={inv.invitationId} className="my-stable__sent-invitation-item">
                    <span className="my-stable__sent-invitation-player">
                      {inv.invitedPlayerName || inv.invitedPlayerId}
                    </span>
                    <span className="my-stable__sent-invitation-status">
                      {t('stables.invitationStatus.pending', 'Pending')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      <CreateStableModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />

      {stable && (
        <InviteToStableModal
          isOpen={showInviteModal}
          stableId={stable.stableId}
          currentMemberIds={stable.memberIds}
          onClose={() => setShowInviteModal(false)}
          onInvited={handleInvited}
        />
      )}
    </div>
  );
}
