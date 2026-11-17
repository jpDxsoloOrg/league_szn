import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play, X } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import './Ticker.css';

export type TickerTagTone = 'action' | 'data' | 'prestige' | 'heat' | 'neutral';

/** How fast the crawl moves. It has no effect with reduced motion. */
export type TickerSpeed = 'slow' | 'normal' | 'fast';

/** One headline in the crawl. */
export interface TickerItem {
  id: string;
  text: string;
  /**
   * A short pill before the headline, such as "Tonight". In the crawl, a run
   * of headlines with the same tag shares one pill.
   */
  tag?: string;
  tagTone?: TickerTagTone;
  /** A site path, opened with the router. */
  to?: string;
  /** An outside http(s) URL, opened in a new tab. */
  externalHref?: string;
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
  /** With both, a "×" at the end hides the strip. */
  dismissLabel?: string;
  onDismiss?: () => void;
  /** Crawl speed; `normal` when left out. */
  speed?: TickerSpeed;
  className?: string;
}

/** The most headlines one crawl carries. */
const TICKER_MAX_ITEM_COUNT = 48;
/** Characters of headline that make one step of crawl time. */
const TICKER_CHARS_PER_STEP = 36;
/** The stylesheet has a crawl length for each step count up to this. */
const TICKER_MAX_STEPS = 48;
/** With reduced motion, each headline shows this long before the next fades in. */
export const TICKER_FADE_INTERVAL_MS = 6000;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** True when this headline starts a run of its tag, so the crawl draws the pill. */
function startsTagRun(items: TickerItem[], index: number): boolean {
  const tag = items[index]?.tag;
  return Boolean(tag) && items[index - 1]?.tag !== tag;
}

/** How long the crawl runs, in steps, so long headlines move as fast as short ones. */
function crawlSteps(items: TickerItem[]): number {
  const characters = items.reduce(
    (total, item, index) => total + item.text.length + (startsTagRun(items, index) ? item.tag?.length ?? 0 : 0),
    0,
  );
  return Math.min(TICKER_MAX_STEPS, Math.max(1, Math.ceil(characters / TICKER_CHARS_PER_STEP)));
}

function ItemContent({ item, showTag }: { item: TickerItem; showTag: boolean }) {
  return (
    <>
      {showTag && item.tag && <span className={`ui-ticker__tag ui-ticker__tag--${item.tagTone ?? 'data'}`}>{item.tag}</span>}
      {item.iconUrl && <img className="ui-ticker__icon" src={item.iconUrl} alt="" loading="lazy" decoding="async" />}
      <span className="ui-ticker__headline">{item.text}</span>
    </>
  );
}

function ItemLink({ item, showTag, focusable }: { item: TickerItem; showTag: boolean; focusable: boolean }) {
  const content = <ItemContent item={item} showTag={showTag} />;
  const tabIndex = focusable ? undefined : -1;
  if (item.to) {
    return <Link to={item.to} className="ui-ticker__link" tabIndex={tabIndex}>{content}</Link>;
  }
  if (item.externalHref) {
    return (
      <a href={item.externalHref} className="ui-ticker__link" target="_blank" rel="noopener noreferrer" tabIndex={tabIndex}>
        {content}
      </a>
    );
  }
  return content;
}

function TickerItems({ items, focusable }: { items: TickerItem[]; focusable: boolean }) {
  return (
    <>
      {items.map((item, index) => {
        const showTag = startsTagRun(items, index);
        return (
          <li key={item.id} className={`ui-ticker__item${showTag ? ' ui-ticker__item--lead' : ''}`}>
            <ItemLink item={item} showTag={showTag} focusable={focusable} />
          </li>
        );
      })}
    </>
  );
}

/**
 * The news crawl. Headlines move right to left behind a label badge, pause
 * under the pointer or while one has focus, and can be paused with the button
 * at the end. With reduced motion nothing moves: one headline at a time fades
 * in where the crawl would be.
 *
 * The crawl loops by drawing the list twice. The second copy is hidden from
 * screen readers and its links are out of the tab order, so each headline is
 * read and reached once. It is not inert: half the time it is the copy on
 * screen, and a click on it has to open the headline like the first.
 */
export default function Ticker({
  label, items: allItems, ariaLabel, pauseLabel, resumeLabel, dismissLabel, onDismiss, speed = 'normal', className = '',
}: TickerProps) {
  const items = allItems.slice(0, TICKER_MAX_ITEM_COUNT);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const fading = reducedMotion && items.length > 0;
  const crawling = !reducedMotion && items.length > 0;
  const rotating = fading && items.length > 1;
  const holding = paused || hovered || focused;

  useEffect(() => {
    if (!rotating || holding) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => index + 1);
    }, TICKER_FADE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [rotating, holding]);

  if (items.length === 0) return null;

  const classes = [
    'ui-ticker',
    crawling ? 'ui-ticker--crawling' : 'ui-ticker--fading',
    crawling ? `ui-ticker--speed-${speed}` : '',
    paused ? 'ui-ticker--paused' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const activeItem = items[activeIndex % items.length];

  return (
    <section
      className={classes}
      aria-label={ariaLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setFocused(false);
      }}
    >
      <span className="ui-ticker__badge">{label}</span>
      <div className="ui-ticker__viewport">
        {crawling ? (
          <div className="ui-ticker__track" data-steps={crawlSteps(items)}>
            <ul className="ui-ticker__list">
              <TickerItems items={items} focusable />
            </ul>
            <ul className="ui-ticker__list" aria-hidden="true">
              <TickerItems items={items} focusable={false} />
            </ul>
          </div>
        ) : activeItem && (
          <ul className="ui-ticker__list ui-ticker__list--single">
            {/* Keyed by position, so each new headline mounts and fades in. */}
            <li key={`${activeIndex}-${activeItem.id}`} className="ui-ticker__item ui-ticker__item--fade" data-testid="ticker-fade-item">
              <ItemLink item={activeItem} showTag focusable />
            </li>
          </ul>
        )}
      </div>
      {(crawling || rotating) && (
        <button
          type="button"
          className="ui-ticker__control btn-ghost"
          aria-label={paused ? resumeLabel : pauseLabel}
          onClick={() => setPaused((wasPaused) => !wasPaused)}
        >
          {paused ? <Play aria-hidden="true" size={16} /> : <Pause aria-hidden="true" size={16} />}
        </button>
      )}
      {onDismiss && dismissLabel && (
        <button type="button" className="ui-ticker__control btn-ghost" aria-label={dismissLabel} onClick={onDismiss}>
          <X aria-hidden="true" size={16} />
        </button>
      )}
    </section>
  );
}
