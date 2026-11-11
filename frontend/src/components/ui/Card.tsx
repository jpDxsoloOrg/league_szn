import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './Card.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `raised` sits on top of another surface, `plain` has no fill. */
  variant?: 'default' | 'raised' | 'plain';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Makes the whole card a router link. */
  to?: string;
  children: ReactNode;
}

export default function Card({ variant = 'default', padding = 'md', to, className = '', children, ...rest }: CardProps) {
  const classes = [
    'ui-card',
    `ui-card--${variant}`,
    `ui-card--pad-${padding}`,
    to ? 'ui-card--link' : '',
    className,
  ].filter(Boolean).join(' ');

  if (to) {
    return <Link to={to} className={classes}>{children}</Link>;
  }
  return <div className={classes} {...rest}>{children}</div>;
}
