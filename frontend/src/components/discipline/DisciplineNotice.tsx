import { useId } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { useNow } from '../../hooks/useNow';
import type { PlayerDisciplineSummary } from '../../types';
import { formatCountdown, liveDiscipline } from '../../utils/discipline';
import { formatInstant } from '../../utils/dateUtils';
import Badge from '../ui/Badge';
import { DISCIPLINE_STATUS_KEYS, DISCIPLINE_STATUS_TONES } from './disciplineStatus';
import './Discipline.css';

interface DisciplineNoticeProps {
  discipline?: PlayerDisciplineSummary | null;
}

/** The player's Strikes panel. Renders nothing with no active strikes. Past strikes are never shown. */
export default function DisciplineNotice({ discipline }: DisciplineNoticeProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const now = useNow(1000, Boolean(discipline) && discipline?.status !== 'clear');
  const live = liveDiscipline(discipline, now);

  if (!live || live.status === 'clear') return null;

  const { status, activeStrikes, cooldownEndsAt, signupBlockedUntil } = live;
  const formatDate = (iso: string) => formatInstant(iso, i18n.language);

  return (
    <section className="strikes-panel" aria-labelledby={titleId}>
      <header className="strikes-panel__header">
        <ShieldAlert aria-hidden="true" size={22} className="strikes-panel__icon" />
        <h2 className="strikes-panel__title" id={titleId}>{t('discipline.notice.title')}</h2>
        <Badge tone={DISCIPLINE_STATUS_TONES[status]}>{t(DISCIPLINE_STATUS_KEYS[status])}</Badge>
      </header>

      {status === 'deactivated' && <p className="strikes-panel__body">{t('discipline.notice.deactivated')}</p>}

      {(signupBlockedUntil || cooldownEndsAt) && (
        <dl className="strikes-panel__windows">
          {signupBlockedUntil && (
            <div className="strikes-panel__window strikes-panel__window--blocked">
              <dt>{t('discipline.notice.suspendedTitle')}</dt>
              <dd>
                <span className="strikes-panel__countdown" role="timer">
                  {t('discipline.notice.liftsIn', {
                    time: formatCountdown(Date.parse(signupBlockedUntil) - now, t),
                  })}
                </span>
                <time dateTime={signupBlockedUntil}>
                  {t('discipline.notice.signupBlockedUntil', { date: formatDate(signupBlockedUntil) })}
                </time>
              </dd>
            </div>
          )}
          {cooldownEndsAt && (
            <div className="strikes-panel__window">
              <dt>{t('discipline.notice.cooldownTitle')}</dt>
              <dd>
                <span className="strikes-panel__countdown" role="timer">
                  {t('discipline.notice.fallsOffIn', {
                    count: activeStrikes.length,
                    time: formatCountdown(Date.parse(cooldownEndsAt) - now, t),
                  })}
                </span>
                <time dateTime={cooldownEndsAt}>
                  {t('discipline.notice.cooldownEnds', { date: formatDate(cooldownEndsAt) })}
                </time>
              </dd>
            </div>
          )}
        </dl>
      )}

      <ol className="strikes-panel__list">
        {activeStrikes.map((strike, index) => (
          <li key={strike.strikeId} className="strikes-panel__strike">
            <span className="strikes-panel__strike-heading">
              <strong>{t('discipline.notice.strikeNumber', { number: index + 1 })}</strong>
              <time dateTime={strike.issuedAt}>{formatDate(strike.issuedAt)}</time>
            </span>
            <span className="strikes-panel__reason">
              {t('discipline.notice.strikeReason', { reason: strike.reason })}
            </span>
          </li>
        ))}
      </ol>

      <Link className="strikes-panel__help" to="/guide/wiki/strikes-and-suspensions">
        {t('discipline.notice.learnMore')}
      </Link>
    </section>
  );
}
