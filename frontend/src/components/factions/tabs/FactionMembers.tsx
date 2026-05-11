import { useTranslation } from 'react-i18next';

// Stub for FAC-12 — Members tab content lands there.
export default function FactionMembers() {
  const { t } = useTranslation();
  return (
    <p className="faction-detail__tab-stub">
      {t('factions.detailTabs.stub.members', 'Members tab — coming soon.')}
    </p>
  );
}
