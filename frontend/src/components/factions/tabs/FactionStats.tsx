import { useTranslation } from 'react-i18next';

// Stub for FAC-13 — Stats tab content lands there.
export default function FactionStats() {
  const { t } = useTranslation();
  return (
    <p className="faction-detail__tab-stub">
      {t('factions.detailTabs.stub.stats', 'Stats tab — coming soon.')}
    </p>
  );
}
