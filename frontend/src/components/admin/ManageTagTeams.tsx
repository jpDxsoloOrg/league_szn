import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { tagTeamsApi } from '../../services/api/tagTeams.api';
import { playersApi } from '../../services/api';
import type { Player } from '../../types';
import type { TagTeam, TagTeamStatus } from '../../types/tagTeam';
import './ManageTagTeams.css';

const ALL_STATUSES: TagTeamStatus[] = ['pending_partner', 'pending_admin', 'active', 'dissolved'];

export default function ManageTagTeams() {
  const { t } = useTranslation();
  const [tagTeams, setTagTeams] = useState<TagTeam[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TagTeamStatus | 'all'>('all');
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const loadTagTeams = useCallback(async () => {
    try {
      setError(null);
      const [data, playersData] = await Promise.all([
        tagTeamsApi.getAll(),
        playersApi.getAll(),
      ]);
      setTagTeams(data);
      setPlayers(playersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tag teams');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTagTeams();
  }, [loadTagTeams]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return tagTeams;
    return tagTeams.filter((tt) => tt.status === statusFilter);
  }, [tagTeams, statusFilter]);

  const showFeedback = (message: string, type: 'success' | 'error') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleApprove = async (tagTeam: TagTeam) => {
    setSubmitting(tagTeam.tagTeamId);
    try {
      await tagTeamsApi.approve(tagTeam.tagTeamId);
      showFeedback(
        t('tagTeams.admin.approved', 'Approved') + `: ${tagTeam.name}`,
        'success'
      );
      await loadTagTeams();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to approve tag team',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleReject = async (tagTeam: TagTeam) => {
    setSubmitting(tagTeam.tagTeamId);
    try {
      await tagTeamsApi.reject(tagTeam.tagTeamId);
      showFeedback(
        t('tagTeams.admin.rejected', 'Rejected') + `: ${tagTeam.name}`,
        'success'
      );
      await loadTagTeams();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to reject tag team',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleDissolve = async (tagTeam: TagTeam) => {
    setSubmitting(tagTeam.tagTeamId);
    try {
      await tagTeamsApi.dissolve(tagTeam.tagTeamId);
      showFeedback(
        t('tagTeams.admin.dissolved', 'Dissolved') + `: ${tagTeam.name}`,
        'success'
      );
      await loadTagTeams();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to dissolve tag team',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const handleDelete = async (tagTeam: TagTeam) => {
    setSubmitting(tagTeam.tagTeamId);
    try {
      await tagTeamsApi.delete(tagTeam.tagTeamId);
      showFeedback(
        t('tagTeams.admin.deleted', 'Deleted') + `: ${tagTeam.name}`,
        'success'
      );
      await loadTagTeams();
    } catch (err) {
      showFeedback(
        err instanceof Error ? err.message : 'Failed to delete tag team',
        'error'
      );
    } finally {
      setSubmitting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const formatPlayer = (playerId: string) => {
    const player = players.find((p) => p.playerId === playerId);
    if (!player) return playerId;
    const parts = [player.name];
    if (player.currentWrestler) parts.push(player.currentWrestler);
    if (player.psnId) parts.push(player.psnId);
    return parts.join(' / ');
  };

  if (loading) {
    return (
      <div className="admin-tagteams">
        <h3>{t('tagTeams.admin.title', 'Manage Tag Teams')}</h3>
        <div className="admin-tagteams-empty"><p>Loading...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-tagteams">
        <h3>{t('tagTeams.admin.title', 'Manage Tag Teams')}</h3>
        <div className="admin-tagteams-feedback error">{error}</div>
        <button onClick={loadTagTeams}>Retry</button>
      </div>
    );
  }

  return (
    <div className="admin-tagteams">
      <h3>{t('tagTeams.admin.title', 'Manage Tag Teams')}</h3>

      <div className="admin-tagteams-controls">
        <div className="admin-tagteams-filter">
          <label>{t('tagTeams.admin.filterByStatus', 'Filter by status')}:</label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as TagTeamStatus | 'all')
            }
          >
            <option value="all">{t('tagTeams.admin.all', 'All')}</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`tagTeams.status.${s}`, s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()))}
              </option>
            ))}
          </select>
        </div>
        <span className="admin-tagteams-count">
          {filtered.length} {filtered.length === 1 ? 'tag team' : 'tag teams'}
        </span>
      </div>

      {feedback && (
        <div className={`admin-tagteams-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="admin-tagteams-empty">
          <p>{t('tagTeams.admin.noTagTeams', 'No tag teams found')}</p>
        </div>
      ) : (
        <table className="admin-tagteams-table">
          <thead>
            <tr>
              <th>{t('tagTeams.admin.name', 'Name')}</th>
              <th>{t('tagTeams.admin.player1', 'Player 1')}</th>
              <th>{t('tagTeams.admin.player2', 'Player 2')}</th>
              <th>{t('tagTeams.admin.status', 'Status')}</th>
              <th>{t('tagTeams.admin.record', 'W/L/D')}</th>
              <th>{t('tagTeams.admin.created', 'Created')}</th>
              <th>{t('tagTeams.admin.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tagTeam) => (
              <tr key={tagTeam.tagTeamId}>
                <td>
                  <span className="admin-tagteams-name">{tagTeam.name}</span>
                </td>
                <td>
                  <span className="admin-tagteams-player">{formatPlayer(tagTeam.player1Id)}</span>
                </td>
                <td>
                  <span className="admin-tagteams-player">{formatPlayer(tagTeam.player2Id)}</span>
                </td>
                <td>
                  <span className={`tagteams-status-badge ${tagTeam.status.replace('_', '-')}`}>
                    {t(`tagTeams.status.${tagTeam.status}`, tagTeam.status.replace('_', ' '))}
                  </span>
                </td>
                <td>
                  <span className="admin-tagteams-record">
                    {tagTeam.wins}-{tagTeam.losses}-{tagTeam.draws}
                  </span>
                </td>
                <td>{formatDate(tagTeam.createdAt)}</td>
                <td>
                  <div className="admin-tagteams-actions">
                    {tagTeam.status === 'pending_admin' && (
                      <>
                        <button
                          className="admin-btn-approve"
                          onClick={() => handleApprove(tagTeam)}
                          disabled={submitting === tagTeam.tagTeamId}
                        >
                          {submitting === tagTeam.tagTeamId
                            ? '...'
                            : t('tagTeams.admin.approve', 'Approve')}
                        </button>
                        <button
                          className="admin-btn-reject"
                          onClick={() => handleReject(tagTeam)}
                          disabled={submitting === tagTeam.tagTeamId}
                        >
                          {submitting === tagTeam.tagTeamId
                            ? '...'
                            : t('tagTeams.admin.reject', 'Reject')}
                        </button>
                      </>
                    )}
                    {tagTeam.status === 'active' && (
                      <button
                        className="admin-btn-dissolve"
                        onClick={() => handleDissolve(tagTeam)}
                        disabled={submitting === tagTeam.tagTeamId}
                      >
                        {submitting === tagTeam.tagTeamId
                          ? '...'
                          : t('tagTeams.admin.dissolve', 'Dissolve')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="admin-btn-delete"
                      onClick={() => handleDelete(tagTeam)}
                      disabled={submitting === tagTeam.tagTeamId}
                      title={t('tagTeams.admin.delete', 'Delete')}
                    >
                      {submitting === tagTeam.tagTeamId ? '...' : t('tagTeams.admin.delete', 'Delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
