import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from './Button';
import './ShowMore.css';

export interface ShowMoreProps {
  shown: number;
  total: number;
  onShowMore: () => void;
}

/**
 * Footer of a capped list. Renders nothing while every row fits on screen. After
 * the button loads the last rows it gives way to the final count, which takes
 * focus so keyboard users keep their place and the count is announced.
 */
export default function ShowMore({ shown, total, onShowMore }: ShowMoreProps) {
  const { t } = useTranslation();
  const [pressed, setPressed] = useState(false);
  const countRef = useRef<HTMLSpanElement>(null);
  const finished = shown >= total;

  useLayoutEffect(() => {
    if (pressed && finished) countRef.current?.focus();
  }, [pressed, finished]);

  if (finished && !pressed) return null;

  const handleShowMore = () => {
    setPressed(true);
    onShowMore();
  };

  return (
    <div className="ui-show-more">
      <span className="ui-show-more__count" role="status" tabIndex={-1} ref={countRef}>
        {t('common.showingCount', { shown, total })}
      </span>
      {!finished && <Button variant="secondary" onClick={handleShowMore}>{t('common.showMore')}</Button>}
    </div>
  );
}
