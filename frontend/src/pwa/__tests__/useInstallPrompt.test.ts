import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STANDALONE_MEDIA_QUERY,
  captureInstallPrompt,
  isIosDevice,
  resetInstallPromptForTests,
  useInstallPrompt,
} from '../useInstallPrompt';

type Outcome = 'accepted' | 'dismissed';

function createInstallEvent(outcome: Outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(async () => undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
  return { event, prompt };
}

function stubMatchMedia(matchingQuery: string | null): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: query === matchingQuery,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

const STUBBED_NAVIGATOR_KEYS = ['userAgent', 'platform', 'maxTouchPoints', 'standalone'] as const;
type NavigatorStub = Partial<Record<(typeof STUBBED_NAVIGATOR_KEYS)[number], string | number | boolean>>;

/** Own properties shadow jsdom's getters; jsdom has no maxTouchPoints or standalone at all. */
function stubNavigator(overrides: NavigatorStub): void {
  Object.entries(overrides).forEach(([key, value]) => {
    Object.defineProperty(navigator, key, { value, configurable: true });
  });
}

function restoreNavigator(): void {
  STUBBED_NAVIGATOR_KEYS.forEach((key) => Reflect.deleteProperty(navigator, key));
}

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

describe('useInstallPrompt', () => {
  beforeEach(() => {
    resetInstallPromptForTests();
    stubMatchMedia(null);
    stubNavigator({ userAgent: ANDROID_UA, platform: 'Linux armv8l', maxTouchPoints: 5 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreNavigator();
    resetInstallPromptForTests();
  });

  it('is unavailable until the browser offers an install prompt', () => {
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.status).toBe('unavailable');
  });

  it('captures beforeinstallprompt, suppresses the browser banner and offers install', () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event } = createInstallEvent();

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(result.current.status).toBe('available');
  });

  it('keeps a prompt that fired before the hook mounted', () => {
    captureInstallPrompt();
    const { event } = createInstallEvent();
    window.dispatchEvent(event);

    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.status).toBe('available');
  });

  it('calls prompt() and reports installed when the user accepts', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event, prompt } = createInstallEvent('accepted');
    act(() => {
      window.dispatchEvent(event);
    });

    let accepted = false;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(accepted).toBe(true);
    expect(result.current.status).toBe('installed');
  });

  it('drops the used prompt when the user dismisses it', async () => {
    const { result } = renderHook(() => useInstallPrompt());
    const { event, prompt } = createInstallEvent('dismissed');
    act(() => {
      window.dispatchEvent(event);
    });

    let accepted = true;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(accepted).toBe(false);
    expect(result.current.status).toBe('unavailable');
  });

  it('reports installed after the appinstalled event', () => {
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(createInstallEvent().event);
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.status).toBe('installed');
  });

  it('hides everything when running in standalone display mode', () => {
    stubMatchMedia(STANDALONE_MEDIA_QUERY);
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(createInstallEvent().event);
    });

    expect(result.current.status).toBe('installed');
  });

  it('shows the iOS hint in Safari on an iPhone', () => {
    stubNavigator({ userAgent: IPHONE_UA, platform: 'iPhone' });
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.status).toBe('ios');
  });

  it('hides the iOS hint when launched from the home screen', () => {
    stubNavigator({ userAgent: IPHONE_UA, platform: 'iPhone', standalone: true });
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.status).toBe('installed');
  });
});

describe('isIosDevice', () => {
  afterEach(() => {
    restoreNavigator();
  });

  it('recognises iPhones and iPadOS, which reports itself as a Mac with touch', () => {
    stubNavigator({ userAgent: IPHONE_UA, platform: 'iPhone', maxTouchPoints: 5 });
    expect(isIosDevice()).toBe(true);

    stubNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isIosDevice()).toBe(true);
  });

  it('does not treat desktop Macs or Android phones as iOS', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 });
    expect(isIosDevice()).toBe(false);

    stubNavigator({ userAgent: ANDROID_UA, platform: 'Linux armv8l', maxTouchPoints: 5 });
    expect(isIosDevice()).toBe(false);
  });
});
