import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import type { CountingSinceReason } from '../../types/progression';
import { countingSinceText } from './progressionFormat';
import './CountingSince.css';

export interface CountingSinceProps {
  /** ISO start of the track's window; nothing renders without it. */
  since?: string;
  reason?: CountingSinceReason;
}

/**
 * The note under a progress meter (PRL-07): where the count starts and, for
 * the player themselves, why. A hint explains that the career record keeps
 * every match and only the goal restarted.
 */
export default function CountingSince({ since, reason }: CountingSinceProps) {
  const { t, i18n } = useTranslation();
  const tooltipId = useId();

  if (!since) return null;
  const sinceDate = new Date(since);
  if (Number.isNaN(sinceDate.getTime())) return null;

  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(sinceDate);

  return (
    <p className="counting-since" data-testid="counting-since">
      <span className="counting-since__text">{countingSinceText(t, date, reason)}</span>
      <span className="counting-since__hint">
        <button
          type="button"
          className="counting-since__trigger"
          aria-label={t('progression.countingSince.infoLabel')}
          aria-describedby={tooltipId}
        >
          <Info aria-hidden="true" size={14} />
        </button>
        <span role="tooltip" id={tooltipId} className="counting-since__tooltip">
          {t('progression.countingSince.tooltip')}
        </span>
      </span>
    </p>
  );
}
