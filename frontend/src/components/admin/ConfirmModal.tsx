import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Detail shown under the message. */
  children?: ReactNode;
}

/** Yes or no question before a destructive action. */
export default function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onCancel, busy = false, children }: ConfirmModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={(
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>{t('common.cancel', 'Cancel')}</Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      )}
    >
      <p>{message}</p>
      {children}
    </Modal>
  );
}
