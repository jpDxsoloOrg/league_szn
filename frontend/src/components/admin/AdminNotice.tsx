import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleAlert, CircleCheck } from 'lucide-react';
import Button from '../ui/Button';
import './adminContent.css';

export interface AdminNoticeProps {
  tone: 'success' | 'error';
  children: ReactNode;
  onDismiss?: () => void;
  /** Extra control, such as a retry button. */
  action?: ReactNode;
}

/** Inline result message. Errors stay until the next action, so they are not toasts. */
export default function AdminNotice({ tone, children, onDismiss, action }: AdminNoticeProps) {
  const { t } = useTranslation();
  const Icon = tone === 'success' ? CircleCheck : CircleAlert;

  return (
    <div className={`ac-notice ac-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="ac-notice__icon" aria-hidden="true" size={20} />
      <span className="ac-notice__text">{children}</span>
      {action}
      {onDismiss && (
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t('adminContent.dismiss', 'Dismiss')}
        </Button>
      )}
    </div>
  );
}
