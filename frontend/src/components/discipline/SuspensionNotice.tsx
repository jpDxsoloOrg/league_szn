import { useTranslation } from 'react-i18next';
import { Ban } from 'lucide-react';
import { useNow } from '../../hooks/useNow';
import { formatCountdown } from '../../utils/discipline';
import { formatInstant } from '../../utils/dateUtils';
import './Discipline.css';

interface SuspensionNoticeProps {
  /** When the sign-up block lifts. */
  until: string;
}

/** How long a sign-up block has left, shown beside the controls it switches off. */
export default function SuspensionNotice({ until }: SuspensionNoticeProps) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const remainingMs = Date.parse(until) - now;
  if (remainingMs <= 0) return null;

  return (
    <div className="suspension-notice">
      <Ban aria-hidden="true" size={18} className="suspension-notice__icon" />
      <p className="suspension-notice__text">
        <strong>{t('discipline.notice.suspendedTitle')}</strong>{' '}
        <span role="timer">{t('discipline.notice.liftsIn', { time: formatCountdown(remainingMs, t) })}</span>{' '}
        <time dateTime={until}>
          {t('discipline.notice.signupBlockedUntil', { date: formatInstant(until, i18n.language) })}
        </time>
      </p>
    </div>
  );
}
