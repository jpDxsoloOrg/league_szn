import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './NotFound.css';

export default function NotFound() {
  const { t } = useTranslation();
  useDocumentTitle(t('notFound.title'));
  return (
    <div className="not-found-page">
      <h1 className="not-found-code">404</h1>
      <h2>{t('notFound.title')}</h2>
      <p>{t('notFound.message')}</p>
      <Link to="/" className="not-found-home-link">
        {t('common.backToHome')}
      </Link>
    </div>
  );
}
