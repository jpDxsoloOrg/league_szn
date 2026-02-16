import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './NotFound.css';

export default function NotFound() {
  const { t } = useTranslation();
  useDocumentTitle(t('notFound.title', 'Page Not Found'));
  return (
    <div className="not-found">
      <h1 className="not-found-code">404</h1>
      <p className="not-found-message">{t('notFound.message', 'Page not found')}</p>
      <p className="not-found-hint">{t('notFound.hint', 'The page you’re looking for doesn’t exist or was moved.')}</p>
      <Link to="/" className="not-found-link">
        {t('notFound.backHome', 'Back to Home')}
      </Link>
    </div>
  );
}
