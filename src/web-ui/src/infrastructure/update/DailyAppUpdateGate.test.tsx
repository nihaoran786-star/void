// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { DailyAppUpdateGate } from './DailyAppUpdateGate';

const mocks = vi.hoisted(() => ({
  checkForUpdates: vi.fn(),
  getConfig: vi.fn(),
  shouldShowDailyUpdatePrompt: vi.fn(() => true),
}));

vi.mock('@/infrastructure/api', () => ({
  systemAPI: {
    checkForUpdates: mocks.checkForUpdates,
    restartApp: vi.fn(),
  },
}));

vi.mock('@/infrastructure/config/services/ConfigManager', () => ({
  configManager: {
    getConfig: mocks.getConfig,
  },
}));

vi.mock('./tauriEnv', () => ({
  isTauriRuntime: () => true,
}));

vi.mock('./appUpdateStorage', () => ({
  recordDailyPromptDismissed: vi.fn(),
  recordSkipThisVersion: vi.fn(),
  shouldShowDailyUpdatePrompt: mocks.shouldShowDailyUpdatePrompt,
}));

vi.mock('./LazyUpdateAvailableDialog', () => ({
  LazyUpdateAvailableDialog: ({ isOpen }: { isOpen: boolean }) => (
    isOpen ? <div data-testid="daily-update-dialog" /> : null
  ),
}));

vi.mock('./LazyUpdateInstallProgressModal', () => ({
  LazyUpdateInstallProgressModal: () => null,
}));

vi.mock('./updateInstallStore', () => {
  const state = {
    status: 'idle',
    progress: null,
    error: null,
    startInstall: vi.fn(),
    clearError: vi.fn(),
    clearInstalled: vi.fn(),
  };
  return {
    useUpdateInstallStore: Object.assign(
      (selector: (value: typeof state) => unknown) => selector(state),
      { setState: vi.fn() },
    ),
  };
});

describe('DailyAppUpdateGate', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.getConfig.mockResolvedValue(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('does not prompt when the desktop updater is unconfigured', async () => {
    mocks.checkForUpdates.mockResolvedValue({
      updaterStatus: 'unconfigured',
      unavailableReason: 'missing_endpoint',
      updateAvailable: true,
      currentVersion: '0.2.8',
      latestVersion: '9.9.9',
      releaseNotes: null,
      releaseDate: null,
    });

    await act(async () => {
      root.render(<DailyAppUpdateGate />);
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(901);
      await Promise.resolve();
    });

    expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(mocks.shouldShowDailyUpdatePrompt).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="daily-update-dialog"]')).toBeNull();
  });

  it('preserves the configured updater prompt flow', async () => {
    mocks.checkForUpdates.mockResolvedValue({
      updaterStatus: 'ready',
      unavailableReason: null,
      updateAvailable: true,
      currentVersion: '0.2.8',
      latestVersion: '0.2.9',
      releaseNotes: null,
      releaseDate: null,
    });

    await act(async () => {
      root.render(<DailyAppUpdateGate />);
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(901);
      await Promise.resolve();
    });

    expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(mocks.shouldShowDailyUpdatePrompt).toHaveBeenCalledWith('0.2.9');
    expect(container.querySelector('[data-testid="daily-update-dialog"]')).not.toBeNull();
  });

  it('does not retry a failed updater check inside the daily gate', async () => {
    mocks.checkForUpdates.mockRejectedValue(new Error('signature validation failed'));

    await act(async () => {
      root.render(<DailyAppUpdateGate />);
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await Promise.resolve();
    });

    expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="daily-update-dialog"]')).toBeNull();
  });
});
