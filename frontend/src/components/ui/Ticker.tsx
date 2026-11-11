import { useState } from 'react';
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
  /** A small picture before the headline, such as a championship belt. Decorative. */
  iconUrl?: string;
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
const TICKER_MAX_ITEM_COUNT = 48;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function TickerItems({ items, focusable }: { items: TickerItem[]; focusable: boolean }) {
  return (
    <>
      {items.map((item) => {
        const content = (
          <>
            {item.tag && <span className={`ui-ticker__tag ui-ticker__tag--${item.tagTone ?? 'data'}`}>{item.tag}</span>}
            {item.iconUrl && <img className="ui-ticker__icon" src={item.iconUrl} alt="" loading="lazy" decoding="async" />}
            <span className="ui-ticker__headline">{item.text}</span>
          </>
        );
        return (
          <li key={item.id} className="ui-ticker__item">
            {item.to ? (
              <Link to={item.to} className="ui-ticker__link" tabIndex={focusable ? undefined : -1}>{content}</Link>
            ) : content}
          </li>
        );
      })}
    </>
  );
}

/**
 * The news crawl. Headlines move right to left behind a label badge, pause
 * under the pointer or while one has focus, and can be paused with the button
 * at the end. With reduced motion it is a list that scrolls sideways by hand.
 *
 * The crawl loops by drawing the list twice. The second copy is hidden from
 * screen readers and its links are out of the tab order, so each headline is
 * read and reached once. It is not inert: half the time it is the copy on
 * screen, and a click on it has to open the headline like the first.
 */
export default function Ticker({ label, items: allItems, ariaLabel, pauseLabel, resumeLabel, className = '' }: TickerProps) {
  const items = allItems.slice(0, TICKER_MAX_ITEM_COUNT);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const [paused, setPaused] = useState(false);
  const crawling = !reducedMotion && items.length > 0;

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
            <ul className="ui-ticker__list" aria-hidden="true">
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
