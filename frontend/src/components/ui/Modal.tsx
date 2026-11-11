import { useRef } from 'react';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './Modal.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Keeps the title for screen readers but hides it on screen. */
  hideTitle?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Actions pinned to the bottom of the dialog. */
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Accessible dialog: focus trap, Escape and overlay click to close, focus
 * returned to the trigger, and role="dialog" with a labelled title.
 */
export default function Modal({ open, onClose, title, description, hideTitle = false, size = 'md', footer, className = '', children }: ModalProps) {
  const { t } = useTranslation();
  const describedBy = description ? undefined : { 'aria-describedby': undefined };
  // Radix only restores focus to its own Trigger, and callers open this from props.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-modal__overlay" />
        <Dialog.Content
          className={`ui-modal ui-modal--${size} ${className}`.trim()}
          onOpenAutoFocus={() => {
            returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={() => returnFocusRef.current?.focus()}
          {...describedBy}
        >
          <div className={hideTitle ? 'ui-modal__header ui-modal__header--bare' : 'ui-modal__header'}>
            <Dialog.Title className={hideTitle ? 'sr-only' : 'ui-modal__title'}>{title}</Dialog.Title>
            {!hideTitle && (
              <Dialog.Close className="ui-modal__close" aria-label={t('common.close')}>
                <X aria-hidden="true" size={20} />
              </Dialog.Close>
            )}
          </div>
          {description && <Dialog.Description className="ui-modal__description">{description}</Dialog.Description>}
          <div className="ui-modal__body">{children}</div>
          {footer && <div className="ui-modal__footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
