import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserX } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteConfig } from '../../contexts/SiteConfigContext';
import { FINE_REASON_MAX_LENGTH, noShowsApi } from '../../services/api/fines.api';
import type { MatchNoShow, MatchStatus } from '../../types';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { useToast } from '../ui/toastContext';
import { economyErrorMessage } from './economyErrors';
import { activeNoShow, canMarkNoShow } from './noShowRules';
import './NoShowButton.css';

export interface NoShowParticipant {
  playerId: string;
  name: string;
}

export interface NoShowButtonProps {
  matchId: string;
  status: MatchStatus;
  completedAt?: string;
  date?: string;
  noShows?: MatchNoShow[];
  participants: NoShowParticipant[];
  /** Called after a mark or an undo, so the page can refetch the match. */
  onChanged?: () => void;
}

/**
 * GM no-show control for one match (ECO-14): marks a participant as a no-show
 * (which fines them the economy's no-show fine) or undoes the mark (which
 * refunds it). Renders nothing for non-staff, with the economy off, or on a
 * match that can't take a no-show and has none to undo.
 */
export default function NoShowButton({
  matchId,
  status,
  completedAt,
  date,
  noShows,
  participants,
  onChanged,
}: NoShowButtonProps) {
  const { t } = useTranslation();
  const { isAdminOrModerator } = useAuth();
  const { features } = useSiteConfig();
  const { showToast } = useToast();
  const noteId = useId();

  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState<MatchNoShow[]>(noShows ?? []);
  const [note, setNote] = useState('');
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMarks(noShows ?? []);
  }, [noShows]);

  const markable = canMarkNoShow({ status, completedAt, date });
  const hasActiveMark = participants.some((participant) => activeNoShow(marks, participant.playerId));
  if (!features.economy || !isAdminOrModerator || participants.length === 0 || (!markable && !hasActiveMark)) {
    return null;
  }

  const replaceMark = (updated: MatchNoShow) => {
    setMarks((current) => {
      const index = current.findIndex((mark) => mark.playerId === updated.playerId && mark.markedAt === updated.markedAt);
      return index === -1 ? [...current, updated] : current.map((mark, position) => (position === index ? updated : mark));
    });
  };

  const act = async (participant: NoShowParticipant, undo: boolean) => {
    setBusyPlayerId(participant.playerId);
    setError(null);
    try {
      const result = undo
        ? await noShowsApi.undo(matchId, participant.playerId)
        : await noShowsApi.mark(matchId, participant.playerId, note.trim() || undefined);
      replaceMark(result.noShow);
      showToast(t(undo ? 'economyFines.noShow.undone' : 'economyFines.noShow.marked', { name: participant.name }), 'success');
      if (!undo) setNote('');
      onChanged?.();
    } catch (err) {
      setError(economyErrorMessage(err, t, t('economyFines.noShow.failed')));
    } finally {
      setBusyPlayerId(null);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<UserX aria-hidden="true" size={16} />}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {t('economyFines.noShow.open')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={t('economyFines.noShow.title')}
        description={t('economyFines.noShow.description')}
      >
        <div className="no-show">
          {error && <p className="no-show__error" role="alert">{error}</p>}
          {markable && (
            <div className="no-show__field">
              <label className="no-show__label" htmlFor={noteId}>{t('economyFines.noShow.note')}</label>
              <input
                id={noteId}
                className="no-show__input"
                maxLength={FINE_REASON_MAX_LENGTH}
                value={note}
                disabled={busyPlayerId !== null}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          )}
          <ul className="no-show__list">
            {participants.map((participant) => {
              const marked = activeNoShow(marks, participant.playerId) !== null;
              const busy = busyPlayerId === participant.playerId;
              return (
                <li key={participant.playerId} className="no-show__row">
                  <span className="no-show__name">{participant.name}</span>
                  {marked && <Badge tone="loss">{t('economyFines.noShow.badge')}</Badge>}
                  {marked ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busy}
                      disabled={busyPlayerId !== null && !busy}
                      onClick={() => void act(participant, true)}
                      aria-label={t('economyFines.noShow.undoFor', { name: participant.name })}
                    >
                      {t('economyFines.noShow.undo')}
                    </Button>
                  ) : markable && (
                    <Button
                      variant="danger"
                      size="sm"
                      loading={busy}
                      disabled={busyPlayerId !== null && !busy}
                      onClick={() => void act(participant, false)}
                      aria-label={t('economyFines.noShow.markFor', { name: participant.name })}
                    >
                      {t('economyFines.noShow.mark')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </>
  );
}
