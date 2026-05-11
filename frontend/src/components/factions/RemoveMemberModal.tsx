import { useTranslation } from 'react-i18next';
import './RemoveMemberModal.css';

interface Props {
  factionName: string;
  /** Name of the member being removed (shown in the title). */
  playerName: string;
  /**
   * True when removing this member would drop active membership to one,
   * triggering the backend's auto-disband path. Surfaces the warning copy.
   */
  willDisband: boolean;
  /** Sticky error string from the previous removal attempt. */
  error?: string | null;
  /** True while the API call is in-flight — disables the buttons. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Shared confirmation dialog for removing a member. Used by the Members tab
 * (FAC-12) and the Manage tab (FAC-16). Trap focus / Esc-to-close are
 * handled by the underlying browser dialog semantics — keep the modal
 * shallow so screen readers stay happy.
 */
export default function RemoveMemberModal({
  factionName,
  playerName,
  willDisband,
  error,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="remove-member-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-member-title"
    >
      <div className="remove-member-modal">
        <h2 id="remove-member-title" className="remove-member-modal__title">
          {t('factions.my.removeMemberConfirmTitle', 'Remove {{playerName}} from {{factionName}}?', {
            playerName,
            factionName,
          })}
        </h2>
        {willDisband && (
          <p className="remove-member-modal__warning">
            {t(
              'factions.my.removeMemberDisbandWarning',
              'This will disband the faction — only the leader would remain.',
            )}
          </p>
        )}
        <p className="remove-member-modal__body">
          {t(
            'factions.members.removeBody',
            'They will lose access to faction-only surfaces (channel, DMs, schedule).',
          )}
        </p>
        {error && (
          <p className="remove-member-modal__error" role="alert">
            {error}
          </p>
        )}
        <div className="remove-member-modal__actions">
          <button
            type="button"
            className="remove-member-modal__cancel"
            onClick={onCancel}
            disabled={busy}
          >
            {t('factions.my.removeMemberCancel', 'Cancel')}
          </button>
          <button
            type="button"
            className="remove-member-modal__confirm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy
              ? t('common.removing', 'Removing…')
              : t('factions.my.removeMemberConfirm', 'Remove member')}
          </button>
        </div>
      </div>
    </div>
  );
}
