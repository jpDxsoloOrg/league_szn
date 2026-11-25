import { useTranslation } from 'react-i18next';
import { formatReturnDate, type BookingCondition } from '../../utils/injuryBooking';
import './injuryBooking.css';

interface InjuryPickerTagsProps {
  condition?: BookingCondition;
  playerId: string;
}

/** INJ-11: "Injured until {date}" and low stamina beside a player in a staff picker. */
export default function InjuryPickerTags({ condition, playerId }: InjuryPickerTagsProps) {
  const { t, i18n } = useTranslation();
  if (!condition) return null;
  const returnsAt = condition.injuredUntil.get(playerId);
  const stamina = condition.lowStamina.get(playerId);
  if (!returnsAt && stamina === undefined) return null;
  return (
    <>
      {returnsAt && (
        <span className="injury-tag injury-tag--injured">
          {t('injuryReport.booking.injuredUntil', { date: formatReturnDate(returnsAt, i18n.language) })}
        </span>
      )}
      {stamina !== undefined && (
        <span className="injury-tag injury-tag--stamina">
          {t('injuryReport.booking.stamina', { stamina })}
        </span>
      )}
    </>
  );
}
