import type { ReactNode } from 'react';
import Button from '../ui/Button';
import './adminRoster.css';

export interface AdminNoticeProps {
  tone: 'error' | 'success' | 'warning' | 'info';
  children: ReactNode;
  /** Shows a dismiss button with this label. */
  dismissLabel?: string;
  onDismiss?: () => void;
}

const TONE_CLASSES: Record<AdminNoticeProps['tone'], string> = {
  error: 'error-message',
  success: 'success-message',
  warning: 'ar-notice--warning',
  info: '',
};

const TONE_ROLES: Partial<Record<AdminNoticeProps['tone'], 'alert' | 'status'>> = {
  error: 'alert',
  success: 'status',
};

/** Inline page message. Errors and results are announced; standing notes are not. */
export default function AdminNotice({ tone, children, dismissLabel, onDismiss }: AdminNoticeProps) {
  return (
    <div className={`ar-notice ${TONE_CLASSES[tone]}`.trim()} role={TONE_ROLES[tone]}>
      <div>{children}</div>
      {dismissLabel && onDismiss && (
        <Button variant="ghost" size="sm" onClick={onDismiss}>{dismissLabel}</Button>
      )}
    </div>
  );
}
