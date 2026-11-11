import { createContext, useContext } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

/** Without a provider, toasts are dropped rather than crashing the caller. */
export const ToastContext = createContext<ToastContextValue>({ showToast: () => undefined });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
