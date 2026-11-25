import { useTranslation } from 'react-i18next';
import AdminNotice from '../admin/AdminNotice';
import type { InjuryWarning } from '../../types/injuryReport';
import { formatReturnDate } from '../../utils/injuryBooking';
import './injuryBooking.css';

interface InjuryWarningsNoticeProps {
  warnings: readonly InjuryWarning[] | undefined;
  /** Display name for a player id; falls back to the name the server sent. */
  nameOf?: (playerId: string) => string | undefined;
  onDismiss?: () => void;
}

/** INJ-11: the injured players a GM booked with the override, as the save returned them. */
export default function InjuryWarningsNotice({ warnings, nameOf, onDismiss }: InjuryWarningsNoticeProps) {
  const { t, i18n } = useTranslation();
  if (!warnings || warnings.length === 0) return null;
  return (
    <AdminNotice tone="warning" onDismiss={onDismiss}>
      <p className="injury-notice__title">{t('injuryReport.booking.warningsTitle', { count: warnings.length })}</p>
      <ul className="injury-notice__list">
        {warnings.map((warning) => (
          <li key={warning.playerId}>
            {t('injuryReport.booking.warningLine', {
              name: nameOf?.(warning.playerId) ?? warning.name,
              date: formatReturnDate(warning.returnsAt, i18n.language),
            })}
          </li>
        ))}
      </ul>
    </AdminNotice>
  );
}
