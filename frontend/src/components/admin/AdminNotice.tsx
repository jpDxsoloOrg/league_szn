import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import Button from '../ui/Button';
import './AdminNotice.css';

export interface AdminNoticeProps {
  tone: 'error' | 'success' | 'warning' | 'info';
  children: ReactNode;
  onDismiss?: () => void;
  /** Overrides the default dismiss button label. */
  dismissLabel?: string;
  /** Extra control, such as a retry button. */
  action?: ReactNode;
}

const TONE_ICONS: Record<AdminNoticeProps['tone'], LucideIcon> = {
  error: CircleAlert,
  success: CircleCheck,
  warning: TriangleAlert,
  info: Info,
};

/** .error-message and .success-message are kept for the e2e page objects. */
const TONE_HOOKS: Partial<Record<AdminNoticeProps['tone'], string>> = {
  error: 'error-message',
  success: 'success-message',
};

const TONE_ROLES: Partial<Record<AdminNoticeProps['tone'], 'alert' | 'status'>> = {
  error: 'alert',
  success: 'status',
};

/** Inline page message. Errors and results are announced; standing notes are not. */
export default function AdminNotice({ tone, children, onDismiss, dismissLabel, action }: AdminNoticeProps) {
  const { t } = useTranslation();
  const Icon = TONE_ICONS[tone];
  const hookClass = TONE_HOOKS[tone];

  return (
    <div
      className={`admin-notice admin-notice--${tone}${hookClass ? ` ${hookClass}` : ''}`}
      role={TONE_ROLES[tone]}
    >
      <Icon className="admin-notice__icon" aria-hidden="true" size={20} />
      <div className="admin-notice__text">{children}</div>
      {action}
      {onDismiss && (
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {dismissLabel ?? t('adminContent.dismiss', 'Dismiss')}
        </Button>
      )}
    </div>
  );
}
