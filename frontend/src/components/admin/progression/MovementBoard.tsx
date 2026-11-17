import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownUp } from 'lucide-react';
import type { Division } from '../../../types';
import type { ProgressionConsiderationEntry, ProgressionTrack } from '../../../types/progression';
import { progressionApi } from '../../../services/api';
import { sortDivisionsByTier } from '../../../utils/divisionTiers';
import Button from '../../ui/Button';
import DataTable from '../../ui/DataTable';
import EmptyState from '../../ui/EmptyState';
import Select from '../../ui/Select';
import Tabs from '../../ui/Tabs';
import AdminNotice from '../AdminNotice';
import CandidateBoard from './CandidateBoard';
import { countFlagged } from './movementCounts';
import type { MovementKind } from './movementCounts';

const MOVEMENT_KINDS: readonly MovementKind[] = ['promotion', 'relegation'];

export interface MovementBoardProps {
  tracks: ProgressionTrack[];
  divisions: Division[];
  /** Bump to reload the candidates and the flag counts, e.g. after a recompute. */
  reloadKey?: number;
  onEditTrack: (track: ProgressionTrack) => void;
  onNewTrack: () => void;
}

function isMovementKind(value: string): value is MovementKind {
  return MOVEMENT_KINDS.some((kind) => kind === value);
}

/** The active track first, then by name. */
function preferredTrack(tracks: readonly ProgressionTrack[]): ProgressionTrack | undefined {
  return tracks.find((track) => track.isActive) ?? tracks[0];
}

/**
 * Division movement: a cross-division count of flagged players, then one
 * division at a time with Promotion and Relegation tabs, each showing the
 * candidate board of that division's track.
 */
export default function MovementBoard({ tracks, divisions, reloadKey = 0, onEditTrack, onNewTrack }: MovementBoardProps) {
  const { t } = useTranslation();
  const movementTracks = useMemo(
    () => tracks.filter((track) => track.kind === 'promotion' || track.kind === 'relegation'),
    [tracks],
  );
  const movementDivisions = useMemo(() => {
    const sourceIds = new Set(movementTracks.map((track) => track.fromDivisionId));
    return sortDivisionsByTier(divisions.filter((division) => sourceIds.has(division.divisionId)));
  }, [movementTracks, divisions]);

  const [divisionId, setDivisionId] = useState('');
  /** null follows the division: Promotion when it has a promotion track, else Relegation. */
  const [kind, setKind] = useState<MovementKind | null>(null);
  const [trackChoice, setTrackChoice] = useState<Record<string, string>>({});
  const [considerations, setConsiderations] = useState<{
    promotion: ProgressionConsiderationEntry[];
    relegation: ProgressionConsiderationEntry[];
  } | null>(null);
  const [countsError, setCountsError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setCountsError(null);
      try {
        const [promotion, relegation] = await Promise.all([
          progressionApi.getConsiderations('promotion', controller.signal),
          progressionApi.getConsiderations('relegation', controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setConsiderations({ promotion, relegation });
      } catch (err) {
        if (controller.signal.aborted) return;
        setCountsError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    return () => controller.abort();
  }, [reloadKey]);

  const counts = useMemo(
    () => (considerations ? countFlagged(movementTracks, considerations.promotion, considerations.relegation) : null),
    [considerations, movementTracks],
  );

  if (movementDivisions.length === 0) {
    return (
      <EmptyState
        icon={<ArrowDownUp aria-hidden="true" size={32} />}
        title={t('progression.admin.movement.noTracks')}
        description={t('progression.admin.movement.noTracksText')}
        actionLabel={t('progression.admin.newTrack')}
        onAction={onNewTrack}
      />
    );
  }

  const selectedDivisionId = movementDivisions.some((division) => division.divisionId === divisionId)
    ? divisionId
    : movementDivisions[0]?.divisionId ?? '';
  const selectedDivision = movementDivisions.find((division) => division.divisionId === selectedDivisionId);
  const hasPromotionTrack = movementTracks.some(
    (track) => track.kind === 'promotion' && track.fromDivisionId === selectedDivisionId,
  );
  const shownKind: MovementKind = kind ?? (hasPromotionTrack ? 'promotion' : 'relegation');

  const openDivision = (nextDivisionId: string, nextKind: MovementKind) => {
    setDivisionId(nextDivisionId);
    setKind(nextKind);
  };

  const kindContent = (tabKind: MovementKind) => {
    const kindTracks = movementTracks.filter(
      (track) => track.kind === tabKind && track.fromDivisionId === selectedDivisionId,
    );
    if (kindTracks.length === 0) {
      return (
        <EmptyState
          title={t(`progression.admin.movement.noTrackForKind.${tabKind}`, { division: selectedDivision?.name ?? '' })}
          actionLabel={t('progression.admin.newTrack')}
          onAction={onNewTrack}
        />
      );
    }
    const choiceKey = `${selectedDivisionId}:${tabKind}`;
    const track = kindTracks.find((candidate) => candidate.trackId === trackChoice[choiceKey]) ?? preferredTrack(kindTracks);
    if (!track) return null;
    return (
      <div className="mp-section">
        <div className="ac-toolbar mp-track-picker">
          {kindTracks.length > 1 ? (
            <Select
              label={t('progression.admin.selectTrack')}
              value={track.trackId}
              onValueChange={(value) => setTrackChoice((previous) => ({ ...previous, [choiceKey]: value }))}
              options={kindTracks.map((candidate) => ({
                value: candidate.trackId,
                label: candidate.isActive ? candidate.name : t('progression.admin.inactiveTrack', { name: candidate.name }),
              }))}
            />
          ) : (
            <span className="ac-cell__title">{track.name}</span>
          )}
          <span className="ac-toolbar__spacer" />
          <Button variant="ghost" size="sm" onClick={() => onEditTrack(track)}>
            {t('progression.admin.movement.editGoals')}
          </Button>
        </div>
        {!track.isActive && <AdminNotice tone="info">{t('progression.admin.board.trackInactive')}</AdminNotice>}
        <CandidateBoard key={track.trackId} track={track} divisions={divisions} reloadKey={reloadKey} />
      </div>
    );
  };

  const countCell = (division: Division, cellKind: MovementKind) => {
    const hasTrack = movementTracks.some((track) => track.kind === cellKind && track.fromDivisionId === division.divisionId);
    if (!hasTrack) return <span className="ac-cell__muted">{t('progression.admin.movement.noTrack')}</span>;
    const count = counts?.get(division.divisionId)?.[cellKind] ?? 0;
    return (
      <Button
        variant="ghost"
        size="sm"
        className={count > 0 ? 'mp-count mp-count--flagged' : 'mp-count'}
        onClick={() => openDivision(division.divisionId, cellKind)}
        aria-label={t(`progression.admin.movement.openCount.${cellKind}`, { division: division.name, count })}
      >
        {counts ? count : '…'}
      </Button>
    );
  };

  return (
    <div className="mp-section">
      <section className="mp-overview" aria-labelledby="mp-overview-title">
        <h3 id="mp-overview-title" className="mp-overview__title">{t('progression.admin.movement.overviewTitle')}</h3>
        {countsError && <AdminNotice tone="error">{t('progression.admin.movement.countsFailed', { message: countsError })}</AdminNotice>}
        <DataTable
          caption={t('progression.admin.movement.overviewTitle')}
          density="dense"
          rows={movementDivisions}
          rowKey={(division) => division.divisionId}
          rowClassName={(division) => (division.divisionId === selectedDivisionId ? 'mp-overview__row--selected' : undefined)}
          columns={[
            {
              key: 'division',
              header: t('progression.admin.movement.columns.division'),
              render: (division) => <span className="ac-cell__title">{division.name}</span>,
            },
            {
              key: 'promotion',
              header: t('progression.admin.movement.columns.promotion'),
              align: 'center',
              render: (division) => countCell(division, 'promotion'),
            },
            {
              key: 'relegation',
              header: t('progression.admin.movement.columns.relegation'),
              align: 'center',
              render: (division) => countCell(division, 'relegation'),
            },
          ]}
        />
      </section>

      <div className="ac-toolbar mp-track-picker">
        <Select
          label={t('progression.admin.movement.selectDivision')}
          value={selectedDivisionId}
          onValueChange={(value) => {
            setDivisionId(value);
            setKind(null);
          }}
          options={movementDivisions.map((division) => ({ value: division.divisionId, label: division.name }))}
        />
      </div>

      <Tabs
        label={t('progression.admin.movement.kindTabs', { division: selectedDivision?.name ?? '' })}
        value={shownKind}
        onValueChange={(value) => {
          if (isMovementKind(value)) setKind(value);
        }}
        items={MOVEMENT_KINDS.map((tabKind) => ({
          value: tabKind,
          label: t(`progression.admin.kinds.${tabKind}`),
          content: kindContent(tabKind),
        }))}
      />
    </div>
  );
}
