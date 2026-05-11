import { useTranslation } from 'react-i18next';

// Stub for FAC-16 — Manage tab content lands there.
export default function FactionManage() {
  const { t } = useTranslation();
  return (
    <p className="faction-detail__tab-stub">
      {t('factions.detailTabs.stub.manage', 'Manage tab — coming soon.')}
    </p>
  );
}
