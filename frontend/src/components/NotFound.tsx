import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import Button from './ui/Button';
import './NotFound.css';

export default function NotFound() {
  const { t } = useTranslation();
  useDocumentTitle(t('notFound.title'));
  return (
    <div className="not-found-page">
      <p className="not-found-code">404</p>
      <h1 className="not-found-title">{t('notFound.title')}</h1>
      <p className="not-found-message">{t('notFound.message')}</p>
      <Button to="/" size="lg">{t('common.backToHome')}</Button>
    </div>
  );
}
