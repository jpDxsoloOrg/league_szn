import { useTranslation } from 'react-i18next';

// Stub for FAC-15 — Messages tab content lands there.
export default function FactionMessages() {
  const { t } = useTranslation();
  return (
    <p className="faction-detail__tab-stub">
      {t('factions.detailTabs.stub.messages', 'Messages tab — coming soon.')}
    </p>
  );
}
