import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './NotFound.css';

export default function NotFound() {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `404 | League SZN`;
    return () => { document.title = 'League SZN'; };
  }, []);
  return (
    <div className="not-found">
      <h1 className="not-found-code">404</h1>
      <p className="not-found-message">{t('common.pageNotFound', 'Page not found')}</p>
      <p className="not-found-hint">{t('common.pageNotFoundHint', 'The page you’re looking for doesn’t exist or has been moved.')}</p>
      <Link to="/" className="not-found-link">{t('common.backToHome', 'Back to Home')}</Link>
    </div>
  );
}
