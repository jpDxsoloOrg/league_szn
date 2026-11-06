import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getInitials } from '../../utils/initials';
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
  /** Shown instead of the title's initials when there is no photo. */
  fallbackIcon?: ReactNode;
  to?: string;
  className?: string;
}

/** Portrait photo card with text over a scrim. A missing or broken photo becomes a colour wash with large initials. */
export default function PhotoTile({ imageUrl, imageAlt = '', title, eyebrow, meta, accent = 'none', badge, fallbackIcon, to, className = '' }: PhotoTileProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  const hasImage = Boolean(imageUrl?.trim()) && !failed;
  const classes = `ui-tile ui-tile--${accent} ${hasImage ? '' : 'ui-tile--fallback'} ${className}`.replace(/\s+/g, ' ').trim();
  const body = (
    <>
      {hasImage ? (
        // React sets props in order, and loading has to land before src or some browsers fetch at once.
        <img className="ui-tile__image" loading="lazy" src={imageUrl ?? undefined} alt={imageAlt} onError={() => setFailed(true)} />
      ) : (
        <span className="ui-tile__fallback" aria-hidden="true">{fallbackIcon ?? getInitials(title)}</span>
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
