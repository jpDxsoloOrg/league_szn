import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'hero';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon shown before the label. */
  icon?: ReactNode;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  fullWidth?: boolean;
  /** Renders a router link styled as a button. */
  to?: string;
  /** Router state for the link, such as where to return after sign-in. */
  linkState?: unknown;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, loading = false, fullWidth = false, to, linkState, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  const classes = [
    'ui-btn',
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    fullWidth ? 'ui-btn--full' : '',
    className,
  ].filter(Boolean).join(' ');

  const content = (
    <>
      {loading ? <LoaderCircle className="ui-btn__spinner" aria-hidden="true" size={18} /> : icon}
      {children}
    </>
  );

  if (to && !disabled && !loading) {
    return <Link to={to} state={linkState} className={classes}>{content}</Link>;
  }

  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

export default Button;
