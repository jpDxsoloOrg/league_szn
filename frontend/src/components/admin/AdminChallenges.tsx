import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Megaphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { challengesApi } from '../../services/api/challenges.api';
import type { ChallengeStatus, ChallengeWithPlayers } from '../../types/challenge';
import Badge from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import Select from '../ui/Select';
import { useToast } from '../ui/toastContext';
import { isNeedsWrestler } from '../../utils/needsWrestler';
import HiddenBadge from './HiddenBadge';
import AdminNotice from './AdminNotice';
import useAdminConfirm from './useAdminConfirm';
import './adminContent.css';

const ALL_STATUSES: ChallengeStatus[] = ['pending', 'accepted', 'declined', 'countered', 'scheduled', 'expired', 'cancelled'];

const STATUS_TONES: Record<ChallengeStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'win',
  declined: 'loss',
  countered: 'violet',
  scheduled: 'primary',
  expired: 'neutral',
  cancelled: 'neutral',
};

function isOpen(challenge: ChallengeWithPlayers): boolean {
  return challenge.status === 'pending' || challenge.status === 'countered' || challenge.status === 'accepted';
}

/** Call-outs moderation. Rendered as a sub-tab of the admin Promos page. */
export default function AdminChallenges() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isSuperAdmin } = useAuth();
  const { confirm, confirmDialog } = useAdminConfirm();
  const [challenges, setChallenges] = useState<ChallengeWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ChallengeStatus | 'all'>('all');
  const [submitting, setSubmitting] = useState<string | null>(null);

  const loadChallenges = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      setChallenges(await challengesApi.getAll(undefined, signal));
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadChallenges(controller.signal);
    return () => controller.abort();
  }, [loadChallenges]);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? challenges : challenges.filter((challenge) => challenge.status === statusFilter)),
    [challenges, statusFilter],
  );

  const matchup = (challenge: ChallengeWithPlayers) => `${challenge.challenger.wrestlerName} vs ${challenge.challenged.wrestlerName}`;

  const handleCancel = async (challenge: ChallengeWithPlayers) => {
    const confirmed = await confirm({
      title: t('adminContent.callOuts.expireTitle', 'Expire {{matchup}}?', { matchup: matchup(challenge) }),
      description: t('adminContent.callOuts.expireConfirm', 'This cannot be undone.'),
      confirmLabel: t('challenges.admin.expire', 'Expire'),
    });
    if (!confirmed) return;

    setSubmitting(challenge.challengeId);
    try {
      await challengesApi.cancel(challenge.challengeId);
      showToast(t('adminContent.callOuts.cancelled', 'Cancelled: {{matchup}}', { matchup: matchup(challenge) }), 'success');
      await loadChallenges();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('adminContent.callOuts.cancelFailed', 'Failed to cancel challenge'), 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleDelete = async (challenge: ChallengeWithPlayers) => {
    const confirmed = await confirm({
      title: t('adminContent.deletePrompt', 'Delete {{name}}?', { name: matchup(challenge) }),
      confirmLabel: t('challenges.admin.delete', 'Delete'),
    });
    if (!confirmed) return;

    setSubmitting(challenge.challengeId);
    try {
      await challengesApi.delete(challenge.challengeId);
      showToast(`${t('challenges.admin.deleted', 'Deleted')}: ${matchup(challenge)}`, 'success');
      await loadChallenges();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('adminContent.callOuts.deleteFailed', 'Failed to delete challenge'), 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleBulkClearResolved = async () => {
    const confirmed = await confirm({
      title: t('challenges.admin.clearResolved', 'Clear Resolved'),
      description: t('challenges.admin.clearResolvedConfirm', 'Are you sure you want to delete all cancelled, expired, and scheduled challenges?'),
      confirmLabel: t('challenges.admin.clearResolved', 'Clear Resolved'),
    });
    if (!confirmed) return;

    try {
      const result = await challengesApi.bulkDelete({ statuses: ['cancelled', 'expired', 'scheduled'] });
      showToast(result.message, 'success');
      await loadChallenges();
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('adminContent.callOuts.clearFailed', 'Failed to clear resolved challenges'), 'error');
    }
  };

  const scheduleChallenge = (challenge: ChallengeWithPlayers) => {
    navigate('/admin/schedule', {
      state: {
        fromChallenge: {
          challengeId: challenge.challengeId,
          challengerId: challenge.challengerId,
          challengedId: challenge.challengedId,
          matchType: challenge.matchType,
          stipulation: challenge.stipulation,
          championshipId: challenge.championshipId,
          challenger: challenge.challenger,
          challenged: challenge.challenged,
        },
      },
    });
  };

  if (error) {
    return (
      <AdminNotice
        tone="error"
        action={<Button variant="ghost" size="sm" onClick={() => loadChallenges()}>{t('common.retry', 'Retry')}</Button>}
      >
        {error}
      </AdminNotice>
    );
  }

  return (
    <section className="ac-section">
      <div className="ac-toolbar">
        <Select
          label={t('challenges.admin.filterByStatus', 'Filter by Status')}
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as ChallengeStatus | 'all')}
          options={[
            { value: 'all', label: t('challenges.admin.all', 'All') },
            ...ALL_STATUSES.map((status) => ({ value: status, label: t(`challenges.status.${status}`, status) })),
          ]}
        />
        <span className="ac-toolbar__count">{filtered.length}</span>
        <span className="ac-toolbar__spacer" />
        {isSuperAdmin && (
          <Button variant="secondary" onClick={handleBulkClearResolved}>
            {t('challenges.admin.clearResolved', 'Clear Resolved')}
          </Button>
        )}
      </div>

      <DataTable
        caption={t('challenges.admin.title', 'Manage Challenges')}
        density="dense"
        loading={loading}
        rows={filtered}
        rowKey={(challenge) => challenge.challengeId}
        empty={(
          <EmptyState
            icon={<Megaphone aria-hidden="true" size={32} />}
            title={t('adminContent.callOuts.emptyTitle', 'No call-outs to show')}
            description={t('adminContent.callOuts.emptyText', 'Challenges between wrestlers will appear here.')}
          />
        )}
        columns={[
          {
            key: 'challenger',
            header: t('challenges.admin.challenger', 'Challenger'),
            render: (challenge) => (
              <span className="ac-cell__text">
                {isNeedsWrestler(challenge.challenger.wrestlerName)
                  ? <HiddenBadge />
                  : <span className="ac-cell__title">{challenge.challenger.wrestlerName}</span>}
                <span className="ac-cell__sub">{challenge.challenger.playerName}</span>
              </span>
            ),
          },
          {
            key: 'challenged',
            header: t('challenges.admin.challenged', 'Challenged'),
            render: (challenge) => (
              <span className="ac-cell__text">
                {isNeedsWrestler(challenge.challenged.wrestlerName)
                  ? <HiddenBadge />
                  : <span className="ac-cell__title">{challenge.challenged.wrestlerName}</span>}
                <span className="ac-cell__sub">{challenge.challenged.playerName}</span>
              </span>
            ),
          },
          {
            key: 'type',
            header: t('challenges.admin.type', 'Type'),
            render: (challenge) => (
              <span className="ac-cell__text">
                <span>{challenge.matchType}</span>
                {challenge.stipulation && <span className="ac-cell__sub">{challenge.stipulation}</span>}
              </span>
            ),
          },
          {
            key: 'status',
            header: t('challenges.admin.status', 'Status'),
            render: (challenge) => (
              <Badge tone={STATUS_TONES[challenge.status]}>{t(`challenges.status.${challenge.status}`, challenge.status)}</Badge>
            ),
          },
          {
            key: 'date',
            header: t('challenges.admin.date', 'Date'),
            render: (challenge) => new Date(challenge.createdAt).toLocaleDateString(),
            sortValue: (challenge) => challenge.createdAt,
          },
          {
            key: 'actions',
            header: t('challenges.admin.actions', 'Actions'),
            align: 'end',
            render: (challenge) => (
              <div className="ac-actions ac-actions--end">
                {challenge.status === 'accepted' && (
                  <Button variant="ghost" size="sm" onClick={() => scheduleChallenge(challenge)}>
                    {t('challenges.admin.schedule', 'Schedule')}
                  </Button>
                )}
                {isSuperAdmin && isOpen(challenge) && (
                  <Button variant="ghost" size="sm" disabled={submitting === challenge.challengeId} onClick={() => handleCancel(challenge)}>
                    {t('challenges.admin.expire', 'Expire')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" to={`/challenges/${challenge.challengeId}`}>
                  {t('challenges.my.viewDetails', 'View Details')}
                </Button>
                {isSuperAdmin && (
                  <Button variant="ghost" size="sm" disabled={submitting === challenge.challengeId} onClick={() => handleDelete(challenge)}>
                    {t('challenges.admin.delete', 'Delete')}
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />

      {confirmDialog}
    </section>
  );
}
