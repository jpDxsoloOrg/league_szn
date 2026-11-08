import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';

/** Chromium's install event. Not in the DOM typings, since it isn't standard. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * - `available`: the browser offered an install prompt; show an Install button.
 * - `ios`: iPhone or iPad, which have no prompt; show the Share hint instead.
 * - `installed`: running as the installed app, or just installed; show nothing.
 * - `unavailable`: nothing to offer in this browser right now; show nothing.
 */
export type InstallStatus = 'available' | 'ios' | 'installed' | 'unavailable';

export const STANDALONE_MEDIA_QUERY = '(display-mode: standalone)';

interface InstallPromptState {
  deferredPrompt: BeforeInstallPromptEvent | null;
  installed: boolean;
}

/*
 * Chromium fires beforeinstallprompt once, early in the page's life, and not
 * again after a route change. The page that shows the button may mount much
 * later, so the event is captured at start-up into this module-level store.
 */
let promptState: InstallPromptState = { deferredPrompt: null, installed: false };
const listeners = new Set<() => void>();
let capturedWindow: Window | null = null;

function setPromptState(next: InstallPromptState): void {
  promptState = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): InstallPromptState {
  return promptState;
}

function handleBeforeInstallPrompt(event: Event): void {
  // Stops Chrome's own mini-infobar; the app offers install in one quiet place.
  event.preventDefault();
  setPromptState({ ...promptState, deferredPrompt: event as BeforeInstallPromptEvent });
}

function handleAppInstalled(): void {
  setPromptState({ deferredPrompt: null, installed: true });
}

/** Starts listening for the install events. Safe to call more than once. */
export function captureInstallPrompt(targetWindow: Window = window): void {
  if (capturedWindow === targetWindow) return;
  capturedWindow?.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  capturedWindow?.removeEventListener('appinstalled', handleAppInstalled);
  targetWindow.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  targetWindow.addEventListener('appinstalled', handleAppInstalled);
  capturedWindow = targetWindow;
}

/** Test helper: forgets any captured prompt and listeners. */
export function resetInstallPromptForTests(): void {
  capturedWindow?.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  capturedWindow?.removeEventListener('appinstalled', handleAppInstalled);
  capturedWindow = null;
  promptState = { deferredPrompt: null, installed: false };
  listeners.clear();
}

interface NavigatorWithStandalone extends Navigator {
  /** iOS Safari's own flag for a home-screen launch. */
  standalone?: boolean;
}

export function isIosDevice(targetNavigator: Navigator = navigator): boolean {
  if (/iPad|iPhone|iPod/.test(targetNavigator.userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac; a touch screen gives it away.
  return targetNavigator.platform === 'MacIntel' && targetNavigator.maxTouchPoints > 1;
}

function isIosStandalone(): boolean {
  return (navigator as NavigatorWithStandalone).standalone === true;
}

export interface InstallPrompt {
  status: InstallStatus;
  /** Opens the browser's install dialog. Resolves true when the user accepts. */
  promptInstall: () => Promise<boolean>;
}

export function useInstallPrompt(): InstallPrompt {
  useEffect(() => {
    captureInstallPrompt();
  }, []);

  const { deferredPrompt, installed } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const isStandaloneDisplay = useMediaQuery(STANDALONE_MEDIA_QUERY);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    // A captured prompt can be shown only once, whatever the answer.
    setPromptState({ ...promptState, deferredPrompt: null });
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    const accepted = choice.outcome === 'accepted';
    if (accepted) setPromptState({ deferredPrompt: null, installed: true });
    return accepted;
  }, [deferredPrompt]);

  let status: InstallStatus = 'unavailable';
  if (installed || isStandaloneDisplay || isIosStandalone()) status = 'installed';
  else if (deferredPrompt) status = 'available';
  else if (isIosDevice()) status = 'ios';

  return { status, promptInstall };
}
