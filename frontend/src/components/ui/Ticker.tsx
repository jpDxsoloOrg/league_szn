import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import './Ticker.css';

export type TickerTagTone = 'action' | 'data' | 'prestige';

/** One headline in the crawl. */
export interface TickerItem {
  id: string;
  text: string;
  /** A short tag before the headline, such as "Result". */
  tag?: string;
  tagTone?: TickerTagTone;
  /** Where the headline leads. */
  to?: string;
}

export interface TickerProps {
  /** The badge at the start of the strip. */
  label: string;
  items: TickerItem[];
  /** Names the strip for screen readers. */
  ariaLabel: string;
  pauseLabel: string;
  resumeLabel: string;
  className?: string;
}

/** The most headlines one crawl carries; the stylesheet has a crawl length for each count up to this. */
const TICKER_MAX_ITEM_COUNT = 12;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function TickerItems({ items, focusable }: { items: TickerItem[]; focusable: boolean }) {
  return (
    <>
      {items.map((item) => (
        <li key={item.id} className="ui-ticker__item">
          {item.tag && <span className={`ui-ticker__tag ui-ticker__tag--${item.tagTone ?? 'data'}`}>{item.tag}</span>}
          {item.to ? (
            <Link to={item.to} className="ui-ticker__headline" tabIndex={focusable ? undefined : -1}>{item.text}</Link>
          ) : (
            <span className="ui-ticker__headline">{item.text}</span>
          )}
        </li>
      ))}
    </>
  );
}

/**
 * The news crawl. Headlines move right to left behind a label badge, pause
 * under the pointer or while one has focus, and can be paused with the button
 * at the end. With reduced motion it is a list that scrolls sideways by hand.
 *
 * The crawl loops by drawing the list twice. The second copy is hidden from
 * screen readers and inert, so each headline is read and reached once.
 */
export default function Ticker({ label, items: allItems, ariaLabel, pauseLabel, resumeLabel, className = '' }: TickerProps) {
  const items = allItems.slice(0, TICKER_MAX_ITEM_COUNT);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const [paused, setPaused] = useState(false);
  const loopCopyRef = useRef<HTMLUListElement>(null);
  const crawling = !reducedMotion && items.length > 0;

  useEffect(() => {
    loopCopyRef.current?.setAttribute('inert', '');
  }, [crawling]);

  if (items.length === 0) return null;

  const classes = ['ui-ticker', crawling ? 'ui-ticker--crawling' : 'ui-ticker--static', paused ? 'ui-ticker--paused' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes} aria-label={ariaLabel}>
      <span className="ui-ticker__badge">{label}</span>
      <div className="ui-ticker__viewport">
        <div className="ui-ticker__track" data-items={items.length}>
          <ul className="ui-ticker__list">
            <TickerItems items={items} focusable />
          </ul>
          {crawling && (
            <ul ref={loopCopyRef} className="ui-ticker__list" aria-hidden="true">
              <TickerItems items={items} focusable={false} />
            </ul>
          )}
        </div>
      </div>
      {crawling && (
        <button
          type="button"
          className="ui-ticker__pause btn-ghost"
          aria-label={paused ? resumeLabel : pauseLabel}
          onClick={() => setPaused((wasPaused) => !wasPaused)}
        >
          {paused ? <Play aria-hidden="true" size={16} /> : <Pause aria-hidden="true" size={16} />}
        </button>
      )}
    </section>
  );
}
