import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../ui/toastContext';

/** Shows a `toast` passed in router state, then clears it so a reload does not repeat it. */
export function useLocationToast(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const state: unknown = location.state;
  const message = typeof state === 'object' && state !== null && 'toast' in state ? state.toast : undefined;

  useEffect(() => {
    if (typeof message !== 'string') return;
    showToast(message, 'success');
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [message, showToast, navigate, location.pathname, location.search]);
}
