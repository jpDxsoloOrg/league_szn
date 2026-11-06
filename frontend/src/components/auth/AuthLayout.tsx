import type { ReactNode } from 'react';
import Card from '../ui/Card';
import '../MeForms.css';
import './Auth.css';

interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  /** Wider card for reading pages such as the welcome screen. */
  wide?: boolean;
  /** Rendered under the card. */
  after?: ReactNode;
  children: ReactNode;
}

/** Centred card shared by the sign-in, sign-up and password screens. */
export default function AuthLayout({ title, subtitle, wide = false, after, children }: AuthLayoutProps) {
  return (
    <div className="auth-container">
      <Card padding="lg" className={wide ? 'auth-card auth-card--wide' : 'auth-card'}>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
      </Card>
      {after}
    </div>
  );
}
