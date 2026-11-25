import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dices, Eye } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { matchesApi } from '../../services/api';
import type { Match, SimulateOfficialResponse, SimulatePreviewResponse } from '../../types';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import SimResultPanel, { SimOddsList } from './SimResultPanel';
import { buildSimSides, matchSimSides } from './simSides';
import './SimMatchActions.css';

export interface SimMatchActionsProps {
  match: Pick<Match, 'matchId' | 'status' | 'participants' | 'teams' | 'sideTagTeams'>;
  nameOf: (playerId: string) => string;
  /** Called once the GM closes the result of an official sim. */
  onRecorded: () => void;
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * GM sim controls for a scheduled match (BLD-14): "Preview" runs a what-if
 * sim that writes nothing; "Simulate & record" shows the odds in a confirm
 * dialog, then settles the match with the official sim and shows the result.
 * Renders nothing for anyone but Moderators and Admins.
 */
export default function SimMatchActions({ match, nameOf, onRecorded }: SimMatchActionsProps) {
  const { t } = useTranslation();
  const { isAdminOrModerator } = useAuth();
  const [preview, setPreview] = useState<SimulatePreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmOdds, setConfirmOdds] = useState<SimulatePreviewResponse | null>(null);
  const [loadingOdds, setLoadingOdds] = useState(false);
  const [recording, setRecording] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [official, setOfficial] = useState<SimulateOfficialResponse | null>(null);

  if (!isAdminOrModerator || match.status !== 'scheduled') return null;

  const sidesFor = (result: SimulatePreviewResponse) => buildSimSides({
    sides: matchSimSides(match),
    nameOf,
    sideTagTeams: match.teams && match.teams.length >= 2 ? match.sideTagTeams : undefined,
    odds: result.probabilities,
  });

  const runPreview = async () => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      setPreview(await matchesApi.simulate({ matchId: match.matchId }));
    } catch (err) {
      setPreviewError(errorText(err, t('sim.actions.previewError')));
    } finally {
      setPreviewing(false);
    }
  };

  const openConfirm = async () => {
    setConfirmOpen(true);
    setConfirmError(null);
    setConfirmOdds(null);
    setOfficial(null);
    setLoadingOdds(true);
    try {
      setConfirmOdds(await matchesApi.simulate({ matchId: match.matchId }));
    } catch (err) {
      setConfirmError(errorText(err, t('sim.actions.previewError')));
    } finally {
      setLoadingOdds(false);
    }
  };

  const closeConfirm = () => {
    if (recording) return;
    setConfirmOpen(false);
    if (official) onRecorded();
  };

  const recordOfficial = async () => {
    setRecording(true);
    setConfirmError(null);
    try {
      setOfficial(await matchesApi.simulateOfficial(match.matchId));
      setPreview(null);
    } catch (err) {
      setConfirmError(errorText(err, t('sim.actions.recordError')));
    } finally {
      setRecording(false);
    }
  };

  const confirmFooter = official ? (
    <Button onClick={closeConfirm}>{t('sim.actions.done')}</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={closeConfirm} disabled={recording}>{t('common.cancel', 'Cancel')}</Button>
      <Button onClick={recordOfficial} loading={recording} disabled={loadingOdds || !confirmOdds}>
        {t('sim.actions.confirmRecord')}
      </Button>
    </>
  );

  return (
    <div className="sim-match-actions" data-testid="sim-match-actions">
      <div className="sim-match-actions__buttons">
        <Button variant="secondary" size="sm" icon={<Eye size={16} aria-hidden="true" />} onClick={runPreview} loading={previewing}>
          {preview ? t('sim.actions.previewAgain') : t('sim.actions.preview')}
        </Button>
        <Button variant="secondary" size="sm" icon={<Dices size={16} aria-hidden="true" />} onClick={openConfirm}>
          {t('sim.actions.simulateRecord')}
        </Button>
      </div>
      {previewError && <p className="sim-match-actions__error" role="alert">{previewError}</p>}
      {preview && (
        <div className="sim-match-actions__preview">
          <p className="sim-match-actions__note">{t('sim.actions.previewNote')}</p>
          <SimResultPanel
            sides={sidesFor(preview)}
            category={preview.category}
            winnerSideId={preview.winnerSideId}
            specialtyHits={preview.specialtyHits}
            playByPlay={preview.playByPlay}
            seed={preview.seed}
          />
        </div>
      )}

      <Modal
        open={confirmOpen}
        onClose={closeConfirm}
        title={official ? t('sim.actions.resultTitle') : t('sim.actions.confirmTitle')}
        footer={confirmFooter}
      >
        {confirmError && <p className="sim-match-actions__error" role="alert">{confirmError}</p>}
        {official ? (
          <SimResultPanel
            sides={sidesFor(official.simulation)}
            category={official.simulation.category}
            winnerSideId={official.simulation.winnerSideId}
            specialtyHits={official.simulation.specialtyHits}
            playByPlay={official.simulation.playByPlay}
            seed={official.simulation.seed}
          />
        ) : (
          <div className="sim-match-actions__confirm">
            <p>{t('sim.actions.confirmMessage')}</p>
            {loadingOdds && <p className="sim-match-actions__note">{t('sim.actions.loadingOdds')}</p>}
            {confirmOdds && (
              <SimOddsList sides={sidesFor(confirmOdds)} specialtyHits={confirmOdds.specialtyHits} />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
