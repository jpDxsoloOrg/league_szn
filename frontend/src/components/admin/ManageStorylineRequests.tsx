import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { storylineRequestsApi } from '../../services/api';
import type { StorylineRequestWithDetails, StorylineRequestType } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import AdminNotice from './AdminNotice';
import { readableName } from './readableName';
import './adminContent.css';
import './ManageStorylineRequests.css';

const REQUEST_TYPE_LABELS: Record<StorylineRequestType, { key: string; fallback: string }> = {
  storyline: { key: 'adminContent.storylines.typeStoryline', fallback: 'Storyline' },
  backstage_attack: { key: 'adminContent.storylines.typeBackstageAttack', fallback: 'Backstage Attack' },
  rivalry: { key: 'adminContent.storylines.typeRivalry', fallback: 'Rivalry' },
};

export default function ManageStorylineRequests() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<StorylineRequestWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gmNoteMap, setGmNoteMap] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setRequests(await storylineRequestsApi.getAll());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleReview = async (requestId: string, status: 'acknowledged' | 'declined') => {
    const gmNote = gmNoteMap[requestId]?.trim();
    if (status === 'declined' && !gmNote) {
      setError(t('adminContent.storylines.noteRequired', 'A note is required when declining a storyline request.'));
      return;
    }
    setSubmitting(requestId);
    setError(null);
    try {
      await storylineRequestsApi.review(requestId, { status, gmNote: gmNote || undefined });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adminContent.storylines.reviewFailed', 'Failed to review request'));
    } finally {
      setSubmitting(null);
    }
  };

  const typeLabel = (type: string): string => {
    const label = REQUEST_TYPE_LABELS[type as StorylineRequestType];
    return label ? t(label.key, label.fallback) : type;
  };

  const reviewerLabel = (request: StorylineRequestWithDetails) => {
    if (!request.reviewedBy) return '—';
    return readableName(
      request.reviewedByName ?? request.reviewedBy,
      t('adminContent.storylines.staffReviewer', 'Staff member'),
    );
  };

  const statusBadge = (status: string) => {
    if (status === 'acknowledged') return <Badge tone="win">{t('adminContent.storylines.acknowledged', 'Acknowledged')}</Badge>;
    if (status === 'declined') return <Badge tone="loss">{t('adminContent.storylines.declined', 'Declined')}</Badge>;
    return <Badge tone="warning">{t('adminContent.storylines.pending', 'Pending')}</Badge>;
  };

  const title = t('adminContent.storylines.title', 'Storyline Requests');

  if (loading) {
    return (
      <div className="ac-page">
        <PageHeader title={title} />
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  const pendingRequests = requests.filter((request) => request.status === 'pending');
  const historyRequests = requests.filter((request) => request.status !== 'pending');

  const pendingContent = pendingRequests.length === 0 ? (
    <EmptyState
      icon={<BookOpen aria-hidden="true" size={32} />}
      title={t('adminContent.storylines.noPending', 'No pending storyline requests.')}
    />
  ) : (
    <div className="ac-section">
      {pendingRequests.map((request) => (
        <Card key={request.requestId} className="storyline-request">
          <div className="storyline-request__header">
            <span className="ac-cell__text">
              <span className="ac-cell__title">{request.requesterName}</span>
              <span className="ac-cell__sub">
                {typeLabel(request.requestType)} · {new Date(request.createdAt).toLocaleDateString()}
              </span>
            </span>
            {statusBadge(request.status)}
          </div>
          <p className="ac-section__text">
            {t('adminContent.storylines.targets', 'Targets')}: {request.targetPlayerNames.join(', ')}
          </p>
          <p className="storyline-request__description">{request.description}</p>
          <div className="ac-field">
            <label className="ac-field__label" htmlFor={`gm-note-${request.requestId}`}>
              {t('adminContent.storylines.gmNote', 'GM Note')}
            </label>
            <input
              id={`gm-note-${request.requestId}`}
              type="text"
              placeholder={t('adminContent.storylines.notePlaceholder', 'GM note (required to decline)...')}
              value={gmNoteMap[request.requestId] || ''}
              onChange={(event) => setGmNoteMap((previous) => ({ ...previous, [request.requestId]: event.target.value }))}
            />
          </div>
          <div className="ac-actions">
            <Button
              loading={submitting === request.requestId}
              onClick={() => handleReview(request.requestId, 'acknowledged')}
            >
              {t('adminContent.storylines.acknowledge', 'Acknowledge')}
            </Button>
            <Button
              variant="danger"
              disabled={submitting === request.requestId}
              onClick={() => handleReview(request.requestId, 'declined')}
            >
              {t('adminContent.storylines.decline', 'Decline')}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );

  const historyContent = (
    <DataTable
      caption={t('adminContent.storylines.history', 'History')}
      density="dense"
      rows={historyRequests}
      rowKey={(request) => request.requestId}
      empty={(
        <EmptyState
          icon={<BookOpen aria-hidden="true" size={32} />}
          title={t('adminContent.storylines.noHistory', 'No resolved storyline requests yet.')}
        />
      )}
      columns={[
        {
          key: 'requester',
          header: t('adminContent.storylines.requester', 'Requester'),
          render: (request) => (
            <span className="ac-cell__text">
              <span className="ac-cell__title">{request.requesterName}</span>
              <span className="ac-cell__sub">{typeLabel(request.requestType)}</span>
            </span>
          ),
        },
        { key: 'targets', header: t('adminContent.storylines.targets', 'Targets'), render: (request) => request.targetPlayerNames.join(', ') },
        { key: 'description', header: t('adminContent.description', 'Description'), render: (request) => request.description },
        { key: 'status', header: t('adminContent.status', 'Status'), render: (request) => statusBadge(request.status) },
        {
          key: 'review',
          header: t('adminContent.storylines.review', 'Review'),
          render: (request) => (
            <span className="ac-cell__text">
              <span>{request.gmNote ?? '—'}</span>
              <span className="ac-cell__sub">
                {reviewerLabel(request)} · {new Date(request.updatedAt).toLocaleDateString()}
              </span>
            </span>
          ),
        },
      ]}
    />
  );

  return (
    <div className="ac-page">
      <PageHeader title={title} />
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      <Tabs
        label={title}
        items={[
          {
            value: 'pending',
            label: `${t('adminContent.storylines.pending', 'Pending')} (${pendingRequests.length})`,
            content: pendingContent,
          },
          {
            value: 'history',
            label: `${t('adminContent.storylines.history', 'History')} (${historyRequests.length})`,
            content: historyContent,
          },
        ]}
      />
    </div>
  );
}
