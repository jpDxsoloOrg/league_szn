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
import type { SearchableSelectOption } from '../SearchableSelect';

export interface ExecuteModalProps {
  /** The candidate to move, or null when closed. */
  candidate: ProgressionBoardEntry | null;
  track: ProgressionTrack;
  divisions: Division[];
  onClose: () => void;
  onExecuted: (candidate: ProgressionBoardEntry, result: ExecuteProgressionResult) => void;
}

/** Confirm a call-up (or promotion / relegation): pick the target division and whether to post News. */
export default function ExecuteModal({ candidate, track, divisions, onClose, onExecuted }: ExecuteModalProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const [toDivisionId, setToDivisionId] = useState(track.toDivisionId ?? '');
  const [announce, setAnnounce] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ExecuteProgressionError | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!candidate) return;
    setToDivisionId(track.toDivisionId ?? '');
    setAnnounce(true);
    setRefusal(null);
    setError(null);
  }, [candidate, track]);

  const options: SearchableSelectOption[] = divisions
    .filter((division) => division.divisionId !== track.fromDivisionId)
    .map((division) => {
      const blocked = track.kind === 'callup' && division.isDevelopmental === true;
      return {
        value: division.divisionId,
        label: division.name,
        disabled: blocked,
        hint: blocked ? t('progression.admin.editor.developmentalHint') : undefined,
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
