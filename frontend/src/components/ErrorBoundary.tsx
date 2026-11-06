import { Component, ReactNode, ErrorInfo } from 'react';
import i18n from '../i18n';
import { logger } from '../utils/logger';
import Button from './ui/Button';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** `section` renders inside the page and keeps the app shell usable. */
  variant?: 'page' | 'section';
  /** The error clears when this changes, so navigating away recovers. */
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidUpdate(previousProps: Props) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Error caught by boundary:', error.message, errorInfo.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className={this.props.variant === 'section' ? 'error-boundary error-boundary--section' : 'error-boundary'}>
          <h1>{i18n.t('errorBoundary.somethingWentWrong')}</h1>
          <p>{i18n.t('errorBoundary.unexpectedError')}</p>
          <Button onClick={this.handleReload}>{i18n.t('errorBoundary.reloadPage')}</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
