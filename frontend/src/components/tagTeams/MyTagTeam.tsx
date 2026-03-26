import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { profileApi, tagTeamsApi } from '../../services/api';
import type { Player } from '../../types';
import type { TagTeamDetailResponse, TagTeam } from '../../types/tagTeam';
import {
  DEFAULT_WRESTLER_IMAGE,
  resolveImageSrc,
  applyImageFallback,
} from '../../constants/imageFallbacks';
import CreateTagTeamModal from './CreateTagTeamModal';
import './MyTagTeam.css';

export default function MyTagTeam() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<Player | null>(null);
  const [tagTeam, setTagTeam] = useState<TagTeamDetailResponse | null>(null);
  const [pendingRequests, setPendingRequests] = useState<TagTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [dissolving, setDissolving] = useState(false);

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
      } else {
        setTagTeam(null);
        // Check for tag teams where this player is player2 with pending_partner status
        try {
          const allTagTeams = await tagTeamsApi.getAll(
            { status: 'pending_partner' },
            signal
          );
          const myPending = allTagTeams.filter(
            (tt) => tt.player2Id === myProfile.playerId
          );
          setPendingRequests(myPending);
        } catch {
          setPendingRequests([]);
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

  const handleRespond = useCallback(async (tagTeamId: string, action: 'accept' | 'decline') => {
    try {
      await tagTeamsApi.respond(tagTeamId, action);
      setActionFeedback(
        action === 'accept'
          ? t('tagTeams.my.accepted', 'Tag team request accepted! Awaiting admin approval.')
          : t('tagTeams.my.declined', 'Tag team request declined.')
      );
      await loadData();
    } catch (err) {
      setActionFeedback(
        `Error: ${err instanceof Error ? err.message : t('common.error', 'Failed')}`
      );
    }
    setTimeout(() => setActionFeedback(null), 3000);
  }, [t, loadData]);

  const handleDissolve = useCallback(async () => {
    if (!tagTeam) return;
    const confirmed = window.confirm(
      t('tagTeams.my.dissolveConfirm', 'Are you sure you want to dissolve this tag team? This cannot be undone.')
    );
    if (!confirmed) return;

    setDissolving(true);
    try {
      await tagTeamsApi.dissolve(tagTeam.tagTeamId);
      setActionFeedback(t('tagTeams.my.dissolved', 'Tag team has been dissolved.'));
      setTagTeam(null);
      const updatedProfile = await profileApi.getMyProfile();
      setProfile(updatedProfile);
    } catch (err) {
      setActionFeedback(
        `Error: ${err instanceof Error ? err.message : t('common.error', 'Failed')}`
      );
    } finally {
      setDissolving(false);
      setTimeout(() => setActionFeedback(null), 3000);
    }
  }, [tagTeam, t]);

  const handleCreated = useCallback(() => {
    loadData();
  }, [loadData]);

  if (!isAuthenticated) {
    return (
      <div className="my-tag-team">
        <div className="my-tag-team__empty">
          <p>{t('tagTeams.my.loginRequired', 'Please log in to manage your tag team.')}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="my-tag-team">
        <div className="my-tag-team__loading">{t('common.loading', 'Loading...')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-tag-team">
        <div className="my-tag-team__error">
          <p>{error}</p>
          <button onClick={() => loadData()} className="btn-primary">
            {t('common.retry', 'Retry')}
          </button>
        </div>
      </div>
    );
  }

  const getPartner = () => {
    if (!tagTeam || !profile) return null;
    return tagTeam.player1.playerId === profile.playerId
      ? tagTeam.player2
      : tagTeam.player1;
  };

  const partner = getPartner();

  return (
    <div className="my-tag-team">
      <div className="my-tag-team__header">
        <h2>{t('tagTeams.my.title', 'My Tag Team')}</h2>
      </div>

      {actionFeedback && (
        <div className="my-tag-team__feedback">{actionFeedback}</div>
      )}

      {!tagTeam && !profile?.tagTeamId ? (
        /* No tag team */
        <div className="my-tag-team__no-team">
          <div className="my-tag-team__no-team-info">
            <h3>{t('tagTeams.my.noTeam', 'You are not in a tag team')}</h3>
            <p>{t('tagTeams.my.noTeamDesc', 'Create a tag team by choosing a partner, or wait for someone to send you a request.')}</p>
            <button
              className="btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              {t('tagTeams.my.createTeam', 'Create a Tag Team')}
            </button>
          </div>

          {pendingRequests.length > 0 && (
            <div className="my-tag-team__pending">
              <h3>{t('tagTeams.my.pendingRequests', 'Pending Tag Team Requests')}</h3>
              <div className="my-tag-team__pending-list">
                {pendingRequests.map((tt) => (
                  <div key={tt.tagTeamId} className="my-tag-team__pending-item">
                    <div className="my-tag-team__pending-info">
                      <span className="my-tag-team__pending-name">{tt.name}</span>
                      <span className="my-tag-team__pending-from">
                        {t('tagTeams.my.requestFrom', 'Request from another player')}
                      </span>
                    </div>
                    <div className="my-tag-team__pending-actions">
                      <button
                        className="btn-sm-accept"
                        onClick={() => handleRespond(tt.tagTeamId, 'accept')}
                      >
                        {t('common.accept', 'Accept')}
                      </button>
                      <button
                        className="btn-sm-decline"
                        onClick={() => handleRespond(tt.tagTeamId, 'decline')}
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
      ) : tagTeam ? (
        /* Has a tag team */
        <div className="my-tag-team__detail">
          <div className="my-tag-team__info-card">
            {tagTeam.imageUrl && (
              <div className="my-tag-team__image-wrapper">
                <img
                  src={resolveImageSrc(tagTeam.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                  onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                  alt={tagTeam.name}
                  className="my-tag-team__image"
                />
              </div>
            )}
            <div className="my-tag-team__info">
              <h3 className="my-tag-team__name">
                <Link to={`/tag-teams/${tagTeam.tagTeamId}`}>{tagTeam.name}</Link>
              </h3>
              <span className={`my-tag-team__status my-tag-team__status--${tagTeam.status}`}>
                {t(`tagTeams.status.${tagTeam.status}`, tagTeam.status.replace('_', ' '))}
              </span>
              <div className="my-tag-team__stats">
                <span className="my-tag-team__stat my-tag-team__stat--wins">
                  {tagTeam.wins}{t('tagTeams.wAbbrev', 'W')}
                </span>
                <span className="my-tag-team__stat my-tag-team__stat--losses">
                  {tagTeam.losses}{t('tagTeams.lAbbrev', 'L')}
                </span>
                <span className="my-tag-team__stat my-tag-team__stat--draws">
                  {tagTeam.draws}{t('tagTeams.dAbbrev', 'D')}
                </span>
              </div>
            </div>
          </div>

          {/* Partner info */}
          {partner && (
            <div className="my-tag-team__partner">
              <h4>{t('tagTeams.my.partner', 'Your Partner')}</h4>
              <div className="my-tag-team__partner-card">
                <div className="my-tag-team__partner-avatar">
                  <img
                    src={resolveImageSrc(partner.imageUrl, DEFAULT_WRESTLER_IMAGE)}
                    onError={(event) => applyImageFallback(event, DEFAULT_WRESTLER_IMAGE)}
                    alt={partner.wrestlerName}
                  />
                </div>
                <div className="my-tag-team__partner-info">
                  <span className="my-tag-team__partner-wrestler">
                    {partner.wrestlerName}
                  </span>
                  <span className="my-tag-team__partner-player">
                    {partner.playerName}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Standings info */}
          {tagTeam.standings && (
            <div className="my-tag-team__standings">
              <h4>{t('tagTeams.my.performance', 'Performance')}</h4>
              <div className="my-tag-team__standings-info">
                <div className="my-tag-team__standings-stat">
                  <span className="my-tag-team__standings-label">
                    {t('tagTeams.my.winPct', 'Win %')}
                  </span>
                  <span className="my-tag-team__standings-value">
                    {tagTeam.standings.winPercentage.toFixed(1)}%
                  </span>
                </div>
                {tagTeam.standings.currentStreak && tagTeam.standings.currentStreak.count > 0 && (
                  <div className="my-tag-team__standings-stat">
                    <span className="my-tag-team__standings-label">
                      {t('tagTeams.my.streak', 'Streak')}
                    </span>
                    <span className={`my-tag-team__standings-value my-tag-team__streak--${tagTeam.standings.currentStreak.type}`}>
                      {tagTeam.standings.currentStreak.count}{tagTeam.standings.currentStreak.type}
                    </span>
                  </div>
                )}
                {tagTeam.standings.recentForm.length > 0 && (
                  <div className="my-tag-team__standings-stat">
                    <span className="my-tag-team__standings-label">
                      {t('tagTeams.my.recentForm', 'Form')}
                    </span>
                    <span className="my-tag-team__standings-form">
                      {tagTeam.standings.recentForm.map((result, idx) => (
                        <span
                          key={idx}
                          className={`my-tag-team__form-pip my-tag-team__form-pip--${result}`}
                        >
                          {result}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          {tagTeam.status === 'active' && (
            <div className="my-tag-team__actions">
              <button
                className="btn-danger"
                onClick={handleDissolve}
                disabled={dissolving}
              >
                {dissolving
                  ? t('common.processing', 'Processing...')
                  : t('tagTeams.my.dissolve', 'Dissolve Tag Team')}
              </button>
            </div>
          )}

          {/* Pending partner - show accept/decline if current user is player2 */}
          {tagTeam.status === 'pending_partner' && profile && tagTeam.player2Id === profile.playerId && (
            <div className="my-tag-team__respond-actions">
              <p>{t('tagTeams.my.partnerRequest', 'You have been invited to form this tag team.')}</p>
              <div className="my-tag-team__respond-buttons">
                <button
                  className="btn-sm-accept"
                  onClick={() => handleRespond(tagTeam.tagTeamId, 'accept')}
                >
                  {t('common.accept', 'Accept')}
                </button>
                <button
                  className="btn-sm-decline"
                  onClick={() => handleRespond(tagTeam.tagTeamId, 'decline')}
                >
                  {t('common.decline', 'Decline')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <CreateTagTeamModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
