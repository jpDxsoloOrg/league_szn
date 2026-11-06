import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './PhotoTile.css';

export type TileAccent = 'none' | 'world' | 'us' | 'ic' | 'tag';

export interface PhotoTileProps {
  imageUrl?: string | null;
  /** Alt text. Leave empty when the title already describes the image. */
  imageAlt?: string;
  title: string;
  /** Small label above the title, such as the championship name. */
  eyebrow?: string;
  /** Line under the title. */
  meta?: ReactNode;
  /** Rim light colour. */
  accent?: TileAccent;
  /** Top-left slot, usually a Badge. */
  badge?: ReactNode;
  to?: string;
  className?: string;
}

/** Portrait photo card with text over a scrim. Falls back to a plain panel. */
export default function PhotoTile({ imageUrl, imageAlt = '', title, eyebrow, meta, accent = 'none', badge, to, className = '' }: PhotoTileProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  const classes = `ui-tile ui-tile--${accent} ${className}`.trim();
  const body = (
    <>
      {imageUrl?.trim() && !failed && (
        <img className="ui-tile__image" src={imageUrl} alt={imageAlt} loading="lazy" onError={() => setFailed(true)} />
      )}
      {badge && <span className="ui-tile__badge">{badge}</span>}
      <span className="ui-tile__text">
        {eyebrow && <span className="ui-tile__eyebrow">{eyebrow}</span>}
        <span className="ui-tile__title">{title}</span>
        {meta && <span className="ui-tile__meta">{meta}</span>}
      </span>
    </>
  );

  return to ? <Link to={to} className={classes}>{body}</Link> : <div className={classes}>{body}</div>;
}
