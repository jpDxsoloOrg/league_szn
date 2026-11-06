import type { HTMLAttributes, ReactNode } from 'react';
import './Badge.css';

export type BadgeTone = 'neutral' | 'primary' | 'pink' | 'violet' | 'win' | 'loss' | 'draw' | 'warning' | 'live';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
}

/** Small status pill. The `live` tone adds a pulsing dot and the only glow. */
export default function Badge({ tone = 'neutral', icon, className = '', children, ...rest }: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge--${tone} ${className}`.trim()} {...rest}>
      {tone === 'live' && <span className="ui-badge__dot" aria-hidden="true" />}
      {icon}
      {children}
    </span>
  );
}
