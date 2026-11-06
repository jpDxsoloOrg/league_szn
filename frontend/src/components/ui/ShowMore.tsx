import { useTranslation } from 'react-i18next';
import Button from './Button';
import './ShowMore.css';

export interface ShowMoreProps {
  shown: number;
  total: number;
  onShowMore: () => void;
}

/** Footer of a capped list. Renders nothing once every row is on screen. */
export default function ShowMore({ shown, total, onShowMore }: ShowMoreProps) {
  const { t } = useTranslation();
  if (shown >= total) return null;
  return (
    <div className="ui-show-more">
      <span className="ui-show-more__count" role="status">{t('common.showingCount', { shown, total })}</span>
      <Button variant="secondary" onClick={onShowMore}>{t('common.showMore')}</Button>
    </div>
  );
}
