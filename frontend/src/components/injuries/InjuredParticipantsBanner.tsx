import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import type { InjuredParticipant } from '../../types/injuryReport';
import { formatReturnDate } from '../../utils/injuryBooking';
import './injuryBooking.css';

interface InjuredParticipantsBannerProps {
  injuredParticipants: readonly InjuredParticipant[] | undefined;
  nameOf: (playerId: string) => string;
}

/**
 * INJ-11: a staff banner on a scheduled match whose participants include
 * someone still injured on its date. Nothing is cancelled; GMs decide.
 */
export default function InjuredParticipantsBanner({ injuredParticipants, nameOf }: InjuredParticipantsBannerProps) {
  const { t, i18n } = useTranslation();
  if (!injuredParticipants || injuredParticipants.length === 0) return null;
  const names = injuredParticipants
    .map((flag) => t('injuryReport.banner.entry', {
      name: nameOf(flag.playerId),
      date: formatReturnDate(flag.returnsAt, i18n.language),
    }))
    .join(', ');
  return (
    <p className="injured-banner" role="note">
      <TriangleAlert className="injured-banner__icon" aria-hidden="true" size={16} />
      <span>{t('injuryReport.banner.text', { count: injuredParticipants.length, names })}</span>
    </p>
  );
}
