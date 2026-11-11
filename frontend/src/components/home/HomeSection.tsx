import { useId } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface HomeSectionProps {
  title: string;
  /** Colour of the bar beside the title. */
  accent?: 'pink' | 'cyan';
  /** Small label on the right, used when there is no link. */
  note?: string;
  linkTo?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}

/** A titled block on the home page, with an optional link to the full page. */
export default function HomeSection({ title, accent = 'pink', note, linkTo, linkLabel, className = '', children }: HomeSectionProps) {
  const headingId = useId();

  return (
    <section className={`home-section ${className}`.trim()} aria-labelledby={headingId}>
      <header className="home-section__header">
        <h2 id={headingId} className={`home-section__title home-section__title--${accent}`}>{title}</h2>
        {note && <span className="home-section__note">{note}</span>}
        {linkTo && linkLabel && <Link to={linkTo} className="home-section__link">{linkLabel}</Link>}
      </header>
      {children}
    </section>
  );
}
