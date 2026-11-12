import { useId } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import type { ModalProps } from '../ui/Modal';
import AdminNotice from './AdminNotice';
import './adminContent.css';

export interface AdminFormModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalProps['size'];
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
  submitDisabled?: boolean;
  /** Shown inside the dialog, because the page behind it is covered. */
  error?: string | null;
  /** Extra footer control, placed before Cancel. */
  extraAction?: ReactNode;
  /** Extra class on the dialog, e.g. `am-sheet` to fill the screen on phones. */
  className?: string;
  children: ReactNode;
}

/** Create and edit dialog: a form in the shared Modal with its actions pinned to the footer. */
export default function AdminFormModal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  submitLabel,
  onSubmit,
  busy = false,
  submitDisabled = false,
  error,
  extraAction,
  className,
  children,
}: AdminFormModalProps) {
  const { t } = useTranslation();
  const formId = useId();

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      description={description}
      size={size}
      className={className}
      footer={(
        <>
          {extraAction}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </>
      )}
    >
      <div className="ac-form">
        {error && <AdminNotice tone="error">{error}</AdminNotice>}
        <form id={formId} className="ac-form" onSubmit={onSubmit}>
          {children}
        </form>
      </div>
    </Modal>
  );
}
