import { useEffect, useState } from 'react';
import './Avatar.css';

export interface AvatarProps {
  /** Image URL. Initials are shown when missing or when it fails to load. */
  src?: string | null;
  /** Used for the alt text and the initials. */
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  ring?: 'none' | 'pink' | 'cyan' | 'violet' | 'gold';
  className?: string;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? words[words.length - 1]?.[0] ?? '' : '';
  return `${first}${last}`.toUpperCase() || '?';
}

export default function Avatar({ src, name, size = 'md', ring = 'none', className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const classes = `ui-avatar ui-avatar--${size} ui-avatar--ring-${ring} ${className}`.trim();
  if (src?.trim() && !failed) {
    return (
      <span className={classes}>
        <img className="ui-avatar__image" src={src} alt={name} loading="lazy" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className={classes} role="img" aria-label={name}>
      <span aria-hidden="true">{getInitials(name)}</span>
    </span>
  );
}
