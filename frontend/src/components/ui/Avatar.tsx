import { useEffect, useState } from 'react';
import { getInitials } from '../../utils/initials';
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

export default function Avatar({ src, name, size = 'md', ring = 'none', className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const classes = `ui-avatar ui-avatar--${size} ui-avatar--ring-${ring} ${className}`.trim();
  if (src?.trim() && !failed) {
    return (
      <span className={classes}>
        {/* React sets props in order, and loading has to land before src or some browsers fetch at once. */}
        <img className="ui-avatar__image" loading="lazy" src={src} alt={name} onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className={classes} role="img" aria-label={name}>
      <span aria-hidden="true">{getInitials(name)}</span>
    </span>
  );
}
