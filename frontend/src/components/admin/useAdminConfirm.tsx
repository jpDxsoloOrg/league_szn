import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

export interface AdminConfirmOptions {
  title: string;
  description?: string;
  confirmLabel: string;
  /** Style the confirm button as destructive. Defaults to true. */
  danger?: boolean;
}

interface PendingConfirm extends AdminConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

export interface AdminConfirm {
  /** Resolves true when the person confirms, false when they back out. */
  confirm: (options: AdminConfirmOptions) => Promise<boolean>;
  /** Render this once in the page. */
  confirmDialog: ReactNode;
}

/** Promise-based confirmation in the shared Modal, in place of window.confirm. */
export default function useAdminConfirm(): AdminConfirm {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: AdminConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const settle = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };

  const confirmDialog = (
    <Modal
      open={pending !== null}
      onClose={() => settle(false)}
      title={pending?.title ?? ''}
      size="sm"
      footer={(
        <>
          <Button variant="ghost" onClick={() => settle(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant={pending?.danger === false ? 'primary' : 'danger'} onClick={() => settle(true)}>
            {pending?.confirmLabel}
          </Button>
        </>
      )}
    >
      {pending?.description && <p className="ac-section__text">{pending.description}</p>}
    </Modal>
  );

  return { confirm, confirmDialog };
}
