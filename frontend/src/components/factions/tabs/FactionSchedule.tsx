import { useTranslation } from 'react-i18next';

// Stub for FAC-14 — Schedule tab content lands there.
export default function FactionSchedule() {
  const { t } = useTranslation();
  return (
    <p className="faction-detail__tab-stub">
      {t('factions.detailTabs.stub.schedule', 'Schedule tab — coming soon.')}
    </p>
  );
}
