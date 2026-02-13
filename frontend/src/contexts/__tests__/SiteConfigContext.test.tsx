import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// --- Hoisted mocks ---
const { mockGetFeatures } = vi.hoisted(() => ({
  mockGetFeatures: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  siteConfigApi: {
    getFeatures: mockGetFeatures,
  },
}));

import { SiteConfigProvider, useSiteConfig } from '../SiteConfigContext';

// --- Test wrapper ---
function wrapper({ children }: { children: ReactNode }) {
  return <SiteConfigProvider>{children}</SiteConfigProvider>;
}

const ALL_ENABLED = {
  fantasy: true,
  challenges: true,
  promos: true,
  contenders: true,
  statistics: true,
};

describe('SiteConfigContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches config on mount and provides features via useSiteConfig()', async () => {
    const serverFeatures = {
      fantasy: false,
      challenges: true,
      promos: false,
      contenders: true,
      statistics: true,
    };
    mockGetFeatures.mockResolvedValue({ features: serverFeatures });

    const { result } = renderHook(() => useSiteConfig(), { wrapper });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetFeatures).toHaveBeenCalledTimes(1);
    expect(result.current.features).toEqual(serverFeatures);
  });

  it('defaults all features enabled when fetch errors', async () => {
    mockGetFeatures.mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() => useSiteConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.features).toEqual(ALL_ENABLED);
  });

  it('merges server response with defaults (fills missing keys)', async () => {
    // Server only returns a subset of features
    mockGetFeatures.mockResolvedValue({
      features: { fantasy: false, challenges: false },
    });

    const { result } = renderHook(() => useSiteConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.features).toEqual({
      fantasy: false,
      challenges: false,
      promos: true,
      contenders: true,
      statistics: true,
    });
  });

  it('refreshConfig re-fetches features from the API', async () => {
    mockGetFeatures.mockResolvedValue({ features: ALL_ENABLED });

    const { result } = renderHook(() => useSiteConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetFeatures).toHaveBeenCalledTimes(1);

    // Server now returns updated features
    mockGetFeatures.mockResolvedValue({
      features: { ...ALL_ENABLED, fantasy: false },
    });

    await act(async () => {
      await result.current.refreshConfig();
    });

    expect(mockGetFeatures).toHaveBeenCalledTimes(2);
    expect(result.current.features.fantasy).toBe(false);
  });

  it('does not update state after unmount (mounted flag cleanup)', async () => {
    let resolveFeatures!: (value: unknown) => void;
    const featuresPromise = new Promise((resolve) => {
      resolveFeatures = resolve;
    });
    mockGetFeatures.mockReturnValue(featuresPromise);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useSiteConfig(), { wrapper });

    // Unmount before the async fetch completes
    unmount();

    // Now resolve the pending promise
    resolveFeatures({ features: { fantasy: false } });

    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 50));

    // No "Can't perform a React state update on an unmounted component" warnings
    const stateUpdateWarnings = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('unmounted')
    );
    expect(stateUpdateWarnings).toHaveLength(0);

    consoleSpy.mockRestore();
  });

  it('useSiteConfig throws when used outside SiteConfigProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useSiteConfig());
    }).toThrow('useSiteConfig must be used within a SiteConfigProvider');

    consoleSpy.mockRestore();
  });
});
