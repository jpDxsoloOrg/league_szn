import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Division } from '../../../types';
import type {
  ExecuteProgressionError,
  ExecuteProgressionResult,
  ProgressionBoardEntry,
  ProgressionTrack,
} from '../../../types/progression';
import { executeProgressionError, progressionApi } from '../../../services/api';
import Button from '../../ui/Button';
import AdminFormModal from '../AdminFormModal';
import AdminNotice from '../AdminNotice';
import SearchableSelect from '../SearchableSelect';
import { getAdjacentDivisions, getDivisionRank } from '../../../utils/divisionTiers';
import type { SearchableSelectOption } from '../SearchableSelect';

export interface ExecuteModalProps {
  /** The candidate to move, or null when closed. */
  candidate: ProgressionBoardEntry | null;
  track: ProgressionTrack;
  divisions: Division[];
  onClose: () => void;
  onExecuted: (candidate: ProgressionBoardEntry, result: ExecuteProgressionResult) => void;
}

/**
 * The preselected target: the track's, else (promotion / relegation) the only
 * division one tier up / down. Empty when the admin has to choose.
 */
function defaultTarget(track: ProgressionTrack, divisions: Division[]): string {
  if (track.toDivisionId) return track.toDivisionId;
  if (track.kind === 'callup') return '';
  const adjacent = getAdjacentDivisions(divisions, track.fromDivisionId, track.kind === 'promotion' ? 'above' : 'below');
  return adjacent.length === 1 ? adjacent[0]?.divisionId ?? '' : '';
}

/** True when a promotion / relegation would move the wrong way on the tier ladder. */
function isWrongDirection(track: ProgressionTrack, source: Division | undefined, target: Division): boolean {
  if (track.kind === 'callup' || !source) return false;
  const sourceRank = getDivisionRank(source);
  const targetRank = getDivisionRank(target);
  if (sourceRank === undefined || targetRank === undefined) return false;
  return track.kind === 'promotion' ? !(targetRank < sourceRank) : !(targetRank > sourceRank);
}

/**
 * Confirm a call-up, promotion or relegation: pick the target division and
 * whether to post News (on by default for call-ups only; opt-in otherwise).
 */
export default function ExecuteModal({ candidate, track, divisions, onClose, onExecuted }: ExecuteModalProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const [toDivisionId, setToDivisionId] = useState(() => defaultTarget(track, divisions));
  const [announce, setAnnounce] = useState(track.kind === 'callup');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ExecuteProgressionError | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!candidate) return;
    setToDivisionId(defaultTarget(track, divisions));
    setAnnounce(track.kind === 'callup');
    setRefusal(null);
    setError(null);
  }, [candidate, track, divisions]);

  const source = divisions.find((division) => division.divisionId === track.fromDivisionId);

  const options: SearchableSelectOption[] = divisions
    .filter((division) => division.divisionId !== track.fromDivisionId)
    .map((division) => {
      const developmental = track.kind === 'callup' && division.isDevelopmental === true;
      const wrongDirection = isWrongDirection(track, source, division);
      let hint: string | undefined;
      if (developmental) hint = t('progression.admin.editor.developmentalHint');
      else if (wrongDirection) hint = t('progression.admin.execute.wrongDirection');
      return {
        value: division.divisionId,
        label: division.name,
        disabled: developmental || wrongDirection,
        hint,
      };
    });

  const run = async (force: boolean) => {
    if (!candidate) return;
    if (!toDivisionId) {
      setError(t('progression.admin.execute.targetRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    setRefusal(null);
    try {
      const result = await progressionApi.execute(candidate.playerId, {
        trackId: track.trackId,
        toDivisionId,
        announce,
        ...(force ? { force: true } : {}),
      });
      onExecuted(candidate, result);
    } catch (err) {
      const coded = executeProgressionError(err);
      if (coded?.code === 'HOLDS_DIVISION_TITLE') {
        setRefusal(coded);
      } else if (coded) {
        setError(t(`progression.admin.execute.errors.${coded.code}`, { name: candidate.name }));
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(false);
  };

  const heldTitles = refusal?.code === 'HOLDS_DIVISION_TITLE' ? refusal.championships : null;

  return (
    <AdminFormModal
      open={candidate !== null}
      onClose={onClose}
      title={t(`progression.admin.execute.title.${track.kind}`, { name: candidate?.name ?? '' })}
      description={t('progression.admin.execute.description')}
      className="am-sheet"
      submitLabel={t(`progression.admin.execute.confirm.${track.kind}`)}
      onSubmit={handleSubmit}
      busy={busy}
      submitDisabled={heldTitles !== null}
      error={error}
      extraAction={heldTitles ? (
        <Button variant="danger" onClick={() => void run(true)} loading={busy}>
          {t('progression.admin.execute.proceedAnyway')}
        </Button>
      ) : undefined}
    >
      {heldTitles && (
        <AdminNotice tone="warning">
          <span>{t('progression.admin.execute.errors.HOLDS_DIVISION_TITLE', { name: candidate?.name ?? '' })}</span>
          <ul className="mp-titles" aria-label={t('progression.admin.execute.heldTitles')}>
            {heldTitles.map((championship) => <li key={championship.championshipId}>{championship.name}</li>)}
          </ul>
        </AdminNotice>
      )}
      <div className="ac-field">
        <label className="ac-field__label" htmlFor={`${baseId}-target`}>{t('progression.admin.execute.targetDivision')}</label>
        <SearchableSelect
          id={`${baseId}-target`}
          options={options}
          value={toDivisionId}
          onChange={setToDivisionId}
          placeholder={t('progression.admin.editor.pickDivision')}
        />
      </div>
      <label className="ac-check am-toggle-row">
        <input
          type="checkbox"
          className="am-toggle"
          checked={announce}
          onChange={(event) => setAnnounce(event.target.checked)}
        />
        {t('progression.admin.execute.announce')}
      </label>
    </AdminFormModal>
  );
}
