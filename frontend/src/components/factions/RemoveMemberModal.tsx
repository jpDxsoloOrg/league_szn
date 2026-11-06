import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import './groupUi.css';

interface Props {
  factionName: string;
  /** Name of the member being removed, shown in the title. */
  playerName: string;
  /** True when this removal would leave one member, which disbands the faction. */
  willDisband: boolean;
  /** Error from the previous attempt. */
  error?: string | null;
  /** True while the request is in flight. */
  busy?: boolean;
  /** `leave` is the caller leaving. It changes the copy, not the request. */
  mode?: 'remove' | 'leave';
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation shared by the Members and Manage tabs. Mount it to open it. */
export default function RemoveMemberModal({
  factionName,
  playerName,
  willDisband,
  error,
  busy,
  mode = 'remove',
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const isLeave = mode === 'leave';

  const title = isLeave
    ? t('factions.members.leaveConfirmTitle', 'Leave {{factionName}}?', { factionName })
    : t('factions.my.removeMemberConfirmTitle', 'Remove {{playerName}} from {{factionName}}?', {
        playerName,
        factionName,
      });

  const body = isLeave
    ? t('factions.members.leaveConfirmBody', 'You will lose access to faction-only surfaces (channel, DMs, schedule).')
    : t('factions.members.removeBody', 'They will lose access to faction-only surfaces (channel, DMs, schedule).');

  const confirmIdleLabel = isLeave
    ? t('factions.members.leaveConfirm', 'Leave faction')
    : t('factions.my.removeMemberConfirm', 'Remove member');

  const confirmBusyLabel = isLeave ? t('common.leaving', 'Leaving…') : t('common.removing', 'Removing…');

  return (
    <Modal
      open
      size="sm"
      title={title}
      onClose={() => { if (!busy) onCancel(); }}
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t('factions.my.removeMemberCancel', 'Cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {busy ? confirmBusyLabel : confirmIdleLabel}
          </Button>
        </>
      )}
    >
      <div className="group-form">
        {willDisband && (
          <p className="group-error">
            {t('factions.my.removeMemberDisbandWarning', 'This will disband the faction — only the leader would remain.')}
          </p>
        )}
        <p className="group-empty">{body}</p>
        {error && <p className="group-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
