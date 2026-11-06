import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';

/** Personal contender status needs player sign-in, which does not exist yet. */
export default function MyContenderStatus() {
  const { t } = useTranslation();
  useDocumentTitle(t('contenders.myStatus.title'));

  return (
    <div>
      <PageHeader
        title={t('contenders.myStatus.title')}
        actions={<Button variant="secondary" to="/contenders">{t('contenders.myStatus.viewRankings')}</Button>}
      />
      <EmptyState
        title={t('contenders.myStatus.comingSoon')}
        description={t('contenders.myStatus.requiresAuth')}
      />
    </div>
  );
}
