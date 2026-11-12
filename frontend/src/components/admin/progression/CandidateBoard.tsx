import { useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Flag, Rocket, Users } from 'lucide-react';
import type { Division } from '../../../types';
import type {
  ExecuteProgressionResult,
  ProgressionBoardEntry,
  ProgressionTrack,
} from '../../../types/progression';
import { progressionApi } from '../../../services/api';
import Avatar from '../../ui/Avatar';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import EmptyState from '../../ui/EmptyState';
import Select from '../../ui/Select';
import Skeleton from '../../ui/Skeleton';
import { useToast } from '../../ui/toastContext';
import GoalChecklist from '../../progression/GoalChecklist';
import ProgressionMeter from '../../progression/ProgressionMeter';
import AdminFormModal from '../AdminFormModal';
import AdminNotice from '../AdminNotice';
import ExecuteModal from './ExecuteModal';
import { daysSinceLastMatch, INACTIVE_DAYS, isInactive } from './candidateActivity';

type CandidateSort = 'progress' | 'goalsMet' | 'name';

/** Max length of the GM note, matching the API. */
const MAX_NOTE_LENGTH = 500;

export interface CandidateBoardProps {
  track: ProgressionTrack;
  divisions: Division[];
  /** Bump to reload, e.g. after a recompute. */
  reloadKey?: number;
  /** Reports how many candidates the board holds. */
  onLoaded?: (count: number) => void;
}

function goalsMet(entry: ProgressionBoardEntry): number {
  return entry.goals.filter((goal) => goal.met).length;
}

function sortCandidates(rows: ProgressionBoardEntry[], sort: CandidateSort): ProgressionBoardEntry[] {
  const sorted = [...rows];
  if (sort === 'name') return sorted.sort((first, second) => first.name.localeCompare(second.name));
  if (sort === 'goalsMet') {
    return sorted.sort((first, second) => goalsMet(second) - goalsMet(first) || second.progressPct - first.progressPct);
  }
  return sorted.sort((first, second) => second.progressPct - first.progressPct || first.name.localeCompare(second.name));
}

/** The track's candidates ranked by progress, with flag and call-up actions. */
export default function CandidateBoard({ track, divisions, reloadKey = 0, onLoaded }: CandidateBoardProps) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const noteId = useId();
  const [rows, setRows] = useState<ProgressionBoardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sort, setSort] = useState<CandidateSort>('progress');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingPlayerId, setPendingPlayerId] = useState<string | null>(null);
  const [flagTarget, setFlagTarget] = useState<ProgressionBoardEntry | null>(null);
  const [note, setNote] = useState('');
  const [flagError, setFlagError] = useState<string | null>(null);
  const [executeTarget, setExecuteTarget] = useState<ProgressionBoardEntry | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const board = await progressionApi.getBoard(track.trackId, undefined, controller.signal);
        if (controller.signal.aborted) return;
        setRows(board.players);
        onLoaded?.(board.players.length);
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
    // onLoaded is a notification only; reloading on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.trackId, reloadKey, retryKey]);

  const shownRows = useMemo(() => {
    const now = Date.now();
    const filtered = rows.filter((row) => (
      (!flaggedOnly || row.consideration) && (!inactiveOnly || isInactive(row, now))
    ));
    return sortCandidates(filtered, sort);
  }, [rows, flaggedOnly, inactiveOnly, sort]);

  const dateFormat = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }), [i18n.language]);

  const emptyTitle = () => {
    if (inactiveOnly) return t('progression.admin.board.emptyInactive', { days: INACTIVE_DAYS });
    if (flaggedOnly) return t('progression.admin.board.emptyFlagged');
    return t('progression.admin.board.empty');
  };

  const toggleExpanded = (playerId: string) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(playerId)) next.delete(playerId);
    else next.add(playerId);
    return next;
  });

  const saveConsideration = async (entry: ProgressionBoardEntry, considering: boolean, noteText?: string) => {
    setPendingPlayerId(entry.playerId);
    setFlagError(null);
    try {
      const result = await progressionApi.setConsideration(entry.playerId, {
        trackId: track.trackId,
        considering,
        ...(noteText ? { note: noteText } : {}),
      });
      setRows((previous) => previous.map((row) => (
        row.playerId === entry.playerId ? { ...row, consideration: result.consideration ?? undefined } : row
      )));
      showToast(
        t(considering ? 'progression.admin.board.flagDone' : 'progression.admin.board.unflagDone', { name: entry.name }),
        'success',
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (considering) setFlagError(message);
      else showToast(t('progression.admin.board.flagFailed', { message }), 'error');
      return false;
    } finally {
      setPendingPlayerId(null);
    }
  };

  const openFlag = (entry: ProgressionBoardEntry) => {
    setNote('');
    setFlagError(null);
    setFlagTarget(entry);
  };

  const handleFlagSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!flagTarget) return;
    const saved = await saveConsideration(flagTarget, true, note.trim() || undefined);
    if (saved) setFlagTarget(null);
  };

  const handleExecuted = (entry: ProgressionBoardEntry, result: ExecuteProgressionResult) => {
    setExecuteTarget(null);
    setRows((previous) => previous.filter((row) => row.playerId !== entry.playerId));
    const division = divisions.find((candidate) => candidate.divisionId === result.toDivisionId)?.name ?? result.toDivisionId;
    showToast(
      t(result.announcementId ? 'progression.admin.execute.doneAnnounced' : 'progression.admin.execute.done', {
        name: entry.name,
        division,
      }),
      'success',
    );
  };

  if (loading) return <Skeleton variant="table" />;

  if (loadError) {
    return (
      <AdminNotice
        tone="error"
        action={<Button variant="ghost" size="sm" onClick={() => setRetryKey((key) => key + 1)}>{t('common.retry', 'Retry')}</Button>}
      >
        {loadError}
      </AdminNotice>
    );
  }

  return (
    <div className="mp-board">
      <div className="ac-toolbar">
        <Select
          label={t('progression.admin.board.sortLabel')}
          value={sort}
          onValueChange={(value) => setSort(value as CandidateSort)}
          options={[
            { value: 'progress', label: t('progression.admin.board.sort.progress') },
            { value: 'goalsMet', label: t('progression.admin.board.sort.goalsMet') },
            { value: 'name', label: t('progression.admin.board.sort.name') },
          ]}
        />
        <label className="ac-check">
          <input type="checkbox" checked={flaggedOnly} onChange={(event) => setFlaggedOnly(event.target.checked)} />
          {t('progression.admin.board.flaggedOnly')}
        </label>
        <label className="ac-check">
          <input type="checkbox" checked={inactiveOnly} onChange={(event) => setInactiveOnly(event.target.checked)} />
          {t('progression.admin.board.inactiveOnly', { days: INACTIVE_DAYS })}
        </label>
        <span className="ac-toolbar__spacer" />
        <span className="ac-toolbar__count">{t('progression.admin.board.count', { count: shownRows.length })}</span>
      </div>

      {shownRows.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden="true" size={32} />}
          title={emptyTitle()}
        />
      ) : (
        <div className="mp-board__table">
          {/* Visual column headings for the desktop grid; the meter and last-match cells carry their own labels. */}
          <div className="mp-board__head" aria-hidden="true">
            <span />
            <span>{t('progression.admin.board.columns.player')}</span>
            <span>{t('progression.admin.board.progress')}</span>
            <span>{t('progression.admin.board.columns.goals')}</span>
            <span>{t('progression.admin.board.columns.lastMatch')}</span>
            <span>{t('progression.admin.board.columns.consideration')}</span>
            <span />
          </div>
          <ol className="mp-board__list" aria-label={t('progression.admin.board.caption', { track: track.name })}>
            {shownRows.map((entry, index) => {
              const met = goalsMet(entry);
              const daysAgo = daysSinceLastMatch(entry);
              const stale = daysAgo === null || daysAgo >= INACTIVE_DAYS;
              const isExpanded = expanded.has(entry.playerId);
              const goalsId = `mp-goals-${entry.playerId}`;
              return (
                <li key={entry.playerId} className="mp-row" data-testid="candidate-row">
                  <div className="mp-row__main">
                    <span className="mp-row__rank" aria-hidden="true">{index + 1}</span>
                    <div className="mp-row__player">
                      <Avatar src={entry.imageUrl} name={entry.name} size="md" />
                      <span className="ac-cell__text">
                        <span className="ac-cell__title">{entry.name}</span>
                        {entry.wrestlerName && <span className="ac-cell__sub">{entry.wrestlerName}</span>}
                      </span>
                    </div>
                    <ProgressionMeter
                      className="mp-row__meter"
                      pct={entry.progressPct}
                      kind={track.kind}
                      label={t('progression.admin.board.progress')}
                      size="sm"
                    />
                    <div className="mp-row__goals">
                      <Badge tone={met === entry.goals.length && met > 0 ? 'win' : 'neutral'}>
                        {t('progression.admin.board.goalsMet', { met, total: entry.goals.length })}
                      </Badge>
                      <ul className="mp-chips" aria-label={t('progression.goals.title')}>
                        {entry.goals.map((goal) => (
                          <li
                            key={goal.goalId}
                            className={goal.met ? 'mp-chip mp-chip--met' : 'mp-chip'}
                            title={t(`progression.metrics.${goal.metric}`)}
                          >
                            {t(`progression.metrics.${goal.metric}`)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className={stale ? 'mp-row__last mp-row__last--stale' : 'mp-row__last'} data-testid="last-match">
                      <span className="mp-row__label">{t('progression.admin.board.columns.lastMatch')}</span>
                      {entry.lastMatchDate && daysAgo !== null ? (
                        <span className="ac-cell__text">
                          <time className="ac-nowrap" dateTime={entry.lastMatchDate}>
                            {dateFormat.format(new Date(entry.lastMatchDate))}
                          </time>
                          <span className="ac-cell__sub">{t('progression.admin.board.daysAgo', { count: daysAgo })}</span>
                        </span>
                      ) : (
                        <span className="ac-cell__muted">{t('progression.admin.board.noMatches')}</span>
                      )}
                    </div>
                    <div className="mp-row__consideration">
                      {entry.consideration ? (
                        <>
                          <Badge tone="warning" icon={<Flag aria-hidden="true" size={14} />}>
                            {t('progression.admin.board.flagged')}
                          </Badge>
                          {entry.consideration.note && <span className="ac-cell__sub mp-row__note">{entry.consideration.note}</span>}
                        </>
                      ) : (
                        <span className="ac-cell__muted">{t('progression.admin.board.notFlagged')}</span>
                      )}
                    </div>
                    <div className="ac-actions mp-row__actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={isExpanded ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
                        aria-expanded={isExpanded}
                        aria-controls={goalsId}
                        onClick={() => toggleExpanded(entry.playerId)}
                      >
                        {isExpanded ? t('progression.admin.board.hideGoals') : t('progression.admin.board.showGoals')}
                      </Button>
                      {entry.consideration ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={pendingPlayerId === entry.playerId}
                          onClick={() => void saveConsideration(entry, false)}
                          aria-label={t('progression.admin.board.unflagFor', { name: entry.name })}
                        >
                          {t('progression.admin.board.unflag')}
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openFlag(entry)}
                          aria-label={t('progression.admin.board.flagFor', { name: entry.name })}
                        >
                          {t('progression.admin.board.flag')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        icon={<Rocket aria-hidden="true" size={16} />}
                        onClick={() => setExecuteTarget(entry)}
                        disabled={!track.isActive}
                        aria-label={t(`progression.admin.execute.actionFor.${track.kind}`, { name: entry.name })}
                      >
                        {t(`progression.admin.execute.action.${track.kind}`)}
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div id={goalsId} className="mp-row__details">
                      <GoalChecklist goals={entry.goals} kind={track.kind} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <AdminFormModal
        open={flagTarget !== null}
        onClose={() => setFlagTarget(null)}
        title={t('progression.admin.board.flagTitle', { name: flagTarget?.name ?? '' })}
        description={t('progression.admin.board.flagDescription')}
        size="sm"
        className="am-sheet"
        submitLabel={t('progression.admin.board.flag')}
        onSubmit={handleFlagSubmit}
        busy={flagTarget !== null && pendingPlayerId === flagTarget.playerId}
        error={flagError}
      >
        <div className="ac-field">
          <label className="ac-field__label" htmlFor={noteId}>{t('progression.admin.board.note')}</label>
          <textarea
            id={noteId}
            rows={3}
            maxLength={MAX_NOTE_LENGTH}
            value={note}
            placeholder={t('progression.admin.board.notePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
          />
          <span className="ac-field__hint">{t('progression.admin.board.noteHint')}</span>
        </div>
      </AdminFormModal>

      <ExecuteModal
        candidate={executeTarget}
        track={track}
        divisions={divisions}
        onClose={() => setExecuteTarget(null)}
        onExecuted={handleExecuted}
      />
    </div>
  );
}
