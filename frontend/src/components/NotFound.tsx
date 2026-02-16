import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import './NotFound.css';

export default function NotFound() {
  const { t } = useTranslation();
  useDocumentTitle(t('common.pageNotFound', 'Page not found'));
  return (
    <div className="not-found">
      <h1 className="not-found-title">404</h1>
      <p className="not-found-message">
        {t('common.pageNotFound', 'Page not found.')}
      </p>
      <Link to="/" className="not-found-link">
        {t('common.backToHome', 'Back to Home')}
      </Link>
    </div>
  );
}
