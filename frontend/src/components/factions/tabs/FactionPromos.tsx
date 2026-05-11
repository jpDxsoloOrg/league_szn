import { useTranslation } from 'react-i18next';

// Stub for FAC-14 — Promos tab content lands there.
export default function FactionPromos() {
  const { t } = useTranslation();
  return (
    <p className="faction-detail__tab-stub">
      {t('factions.detailTabs.stub.promos', 'Promos tab — coming soon.')}
    </p>
  );
}
