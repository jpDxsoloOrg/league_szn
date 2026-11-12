import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, RefreshCw, Rocket } from 'lucide-react';
import type { Division } from '../../types';
import type { ProgressionTrack } from '../../types/progression';
import { divisionsApi, progressionApi } from '../../services/api';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DataTable from '../ui/DataTable';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';
import Select from '../ui/Select';
import Skeleton from '../ui/Skeleton';
import Tabs from '../ui/Tabs';
import { useToast } from '../ui/toastContext';
import AdminNotice from './AdminNotice';
import CandidateBoard from './progression/CandidateBoard';
import EventHistory from './progression/EventHistory';
import TrackEditor from './progression/TrackEditor';
import './adminContent.css';
import './ManageProgression.css';

type View = 'board' | 'tracks' | 'history';

const VIEWS: readonly View[] = ['board', 'tracks', 'history'];

function toView(value: string): View {
  return VIEWS.find((view) => view === value) ?? 'board';
}

/** The track the board opens on: the active call-up track, else any active one, else the first. */
function defaultTrackId(tracks: ProgressionTrack[]): string {
  const activeCallup = tracks.find((track) => track.kind === 'callup' && track.isActive);
  return (activeCallup ?? tracks.find((track) => track.isActive) ?? tracks[0])?.trackId ?? '';
}

/** Admin "Call-Ups" page: rank candidates on a track, flag and call them up, edit the tracks, and review the history. */
export default function ManageProgression() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [tracks, setTracks] = useState<ProgressionTrack[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [view, setView] = useState<View>('board');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [boardReloadKey, setBoardReloadKey] = useState(0);
  const [candidateCount, setCandidateCount] = useState<number | undefined>(undefined);
  const [recomputing, setRecomputing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTrack, setEditingTrack] = useState<ProgressionTrack | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [trackData, divisionData] = await Promise.all([
          progressionApi.getTracks({}, controller.signal),
          divisionsApi.getAll(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setTracks(trackData);
        setDivisions(divisionData);
        setSelectedTrackId((current) => (
          trackData.some((track) => track.trackId === current) ? current : defaultTrackId(trackData)
        ));
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [reloadKey]);

  const divisionName = useCallback(
    (divisionId: string | undefined) => (divisionId
      ? divisions.find((division) => division.divisionId === divisionId)?.name ?? divisionId
      : t('progression.admin.tracks.noDestination')),
    [divisions, t],
  );

  const selectedTrack = tracks.find((track) => track.trackId === selectedTrackId) ?? null;

  const trackOptions = useMemo(() => tracks.map((track) => ({
    value: track.trackId,
    label: track.isActive ? track.name : t('progression.admin.inactiveTrack', { name: track.name }),
  })), [tracks, t]);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const result = await progressionApi.recompute();
      const summary = t('progression.admin.recomputeDone', {
        players: result.playersProcessed,
        updated: result.rowsUpdated,
        dropped: result.rowsDropped,
      });
      if (result.failures.length > 0) {
        showToast(`${summary} ${t('progression.admin.recomputeFailures', { count: result.failures.length })}`, 'error');
      } else {
        showToast(summary, 'success');
      }
      setBoardReloadKey((key) => key + 1);
    } catch (err) {
      showToast(t('progression.admin.recomputeFailed', { message: err instanceof Error ? err.message : String(err) }), 'error');
    } finally {
      setRecomputing(false);
    }
  };

  const openEditor = (track: ProgressionTrack | null) => {
    setEditingTrack(track);
    setEditorOpen(true);
  };

  const handleSaved = (saved: ProgressionTrack, created: boolean) => {
    setEditorOpen(false);
    setTracks((previous) => (created
      ? [...previous, saved]
      : previous.map((track) => (track.trackId === saved.trackId ? saved : track))));
    if (created || !selectedTrackId) setSelectedTrackId(saved.trackId);
    // A save queues a recompute; reload the board so it shows the new goals.
    setBoardReloadKey((key) => key + 1);
    showToast(t(created ? 'progression.admin.editor.created' : 'progression.admin.editor.saved', { name: saved.name }), 'success');
  };

  const title = t('progression.admin.title');
  const headerActions = (
    <>
      <Button
        variant="secondary"
        icon={<RefreshCw aria-hidden="true" size={16} />}
        loading={recomputing}
        onClick={() => void handleRecompute()}
      >
        {t('progression.admin.recompute')}
      </Button>
      <Button icon={<Plus aria-hidden="true" size={16} />} onClick={() => openEditor(null)} disabled={loading || Boolean(loadError)}>
        {t('progression.admin.newTrack')}
      </Button>
    </>
  );

  if (loading) {
    return (
      <div className="ac-page mp-page">
        <PageHeader title={title} />
        <Skeleton variant="block" count={3} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ac-page mp-page">
        <PageHeader title={title} />
        <AdminNotice
          tone="error"
          action={<Button variant="ghost" size="sm" onClick={() => setReloadKey((key) => key + 1)}>{t('common.retry', 'Retry')}</Button>}
        >
          {t('progression.admin.loadFailed', { message: loadError })}
        </AdminNotice>
      </div>
    );
  }

  const boardContent = selectedTrack ? (
    <div className="mp-section">
      <div className="ac-toolbar mp-track-picker">
        <Select
          id="progression-track-select"
          label={t('progression.admin.selectTrack')}
          value={selectedTrackId}
          onValueChange={(value) => {
            setSelectedTrackId(value);
            setCandidateCount(undefined);
          }}
          options={trackOptions}
        />
        <span className="ac-cell__sub">
          {t('progression.admin.trackRoute', {
            from: divisionName(selectedTrack.fromDivisionId),
            to: divisionName(selectedTrack.toDivisionId),
          })}
        </span>
        <span className="ac-toolbar__spacer" />
        <Button variant="ghost" size="sm" onClick={() => openEditor(selectedTrack)}>
          {t('progression.admin.tracks.edit')}
        </Button>
      </div>
      {!selectedTrack.isActive && <AdminNotice tone="info">{t('progression.admin.board.trackInactive')}</AdminNotice>}
      <CandidateBoard
        key={selectedTrack.trackId}
        track={selectedTrack}
        divisions={divisions}
        reloadKey={boardReloadKey}
        onLoaded={setCandidateCount}
      />
    </div>
  ) : null;

  const tracksContent = (
    <DataTable
      caption={t('progression.admin.tabs.tracks')}
      density="dense"
      rows={tracks}
      rowKey={(track) => track.trackId}
      columns={[
        {
          key: 'name',
          header: t('progression.admin.tracks.columns.name'),
          sortValue: (track) => track.name,
          render: (track) => (
            <span className="ac-cell__text">
              <span className="ac-cell__title">{track.name}</span>
              <span className="ac-cell__sub">{t(`progression.admin.kinds.${track.kind}`)}</span>
            </span>
          ),
        },
        {
          key: 'route',
          header: t('progression.admin.tracks.columns.divisions'),
          render: (track) => t('progression.admin.trackRoute', {
            from: divisionName(track.fromDivisionId),
            to: divisionName(track.toDivisionId),
          }),
        },
        {
          key: 'goals',
          header: t('progression.admin.tracks.columns.goals'),
          align: 'center',
          sortValue: (track) => track.goals.length,
          render: (track) => track.goals.length,
        },
        {
          key: 'window',
          header: t('progression.admin.tracks.columns.window'),
          hideOnMobile: true,
          render: (track) => t(`progression.admin.windowModes.${track.windowMode}`),
        },
        {
          key: 'status',
          header: t('progression.admin.tracks.columns.status'),
          render: (track) => (
            <Badge tone={track.isActive ? 'win' : 'neutral'}>
              {track.isActive ? t('progression.admin.active') : t('progression.admin.inactive')}
            </Badge>
          ),
        },
        {
          key: 'actions',
          header: t('common.actions', 'Actions'),
          align: 'end',
          render: (track) => (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEditor(track)}
              aria-label={t('progression.admin.tracks.editFor', { name: track.name })}
            >
              {t('progression.admin.tracks.edit')}
            </Button>
          ),
        },
      ]}
    />
  );

  return (
    <div className="ac-page mp-page">
      <PageHeader title={title} subtitle={t('progression.admin.subtitle')} actions={headerActions} />

      {tracks.length === 0 ? (
        <EmptyState
          icon={<Rocket aria-hidden="true" size={32} />}
          title={t('progression.admin.noTracks')}
          description={t('progression.admin.noTracksText')}
        />
      ) : (
        <Tabs
          label={title}
          value={view}
          onValueChange={(value) => setView(toView(value))}
          items={[
            { value: 'board', label: t('progression.admin.tabs.board'), content: boardContent },
            { value: 'tracks', label: t('progression.admin.tabs.tracks'), content: tracksContent },
            // Radix unmounts inactive panels, so the history reloads each time it is opened.
            { value: 'history', label: t('progression.admin.tabs.history'), content: <EventHistory tracks={tracks} /> },
          ]}
        />
      )}

      <TrackEditor
        open={editorOpen}
        track={editingTrack}
        divisions={divisions}
        candidateCount={editingTrack && editingTrack.trackId === selectedTrackId ? candidateCount : undefined}
        onClose={() => setEditorOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
