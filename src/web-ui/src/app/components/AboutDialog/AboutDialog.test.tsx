// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckForUpdatesResponse } from '@/infrastructure/api/service-api/SystemAPI';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  checkForUpdates: vi.fn(),
  restartApp: vi.fn(),
  startInstall: vi.fn(),
}));

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/component-library', () => ({
  Alert: ({ type, message }: { type: string; message: React.ReactNode }) => (
    <div data-testid={`alert-${type}`}>{message}</div>
  ),
  Button: ({
    children,
    isLoading: _isLoading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean }) => (
    <button {...props}>{children}</button>
  ),
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => (
    isOpen ? <div data-testid="about-modal">{children}</div> : null
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/infrastructure/api', () => ({
  systemAPI: {
    checkForUpdates: mocks.checkForUpdates,
    restartApp: mocks.restartApp,
  },
}));

vi.mock('@/infrastructure/update/tauriEnv', () => ({
  isTauriRuntime: () => true,
}));

vi.mock('@/infrastructure/update/UpdateAvailableDialog', () => ({
  UpdateAvailableDialog: ({
    isOpen,
    data,
  }: {
    isOpen: boolean;
    data: CheckForUpdatesResponse | null;
  }) => {
    if (!isOpen) return null;
    return (
      <div
        data-testid="manual-update-dialog"
        data-latest-version={data?.latestVersion ?? ''}
      />
    );
  },
}));

vi.mock('@/infrastructure/update/updateInstallStore', () => {
  const state = {
    status: 'idle',
    progress: { downloaded: 0, total: null },
    error: null,
    startInstall: mocks.startInstall,
  };
  return {
    useUpdateInstallStore: Object.assign(
      (selector: (value: typeof state) => unknown) => selector(state),
      { setState: vi.fn() },
    ),
  };
});

vi.mock('@/infrastructure/update/updateErrorMessage', () => ({
  formatUpdateInstallError: (message: string) => `formatted:${message}`,
}));

vi.mock('@/shared/utils/version', () => ({
  getAboutInfo: () => ({
    version: {
      name: 'void',
      version: '0.2.8',
      isDev: false,
      buildDate: '2026-07-17',
      gitCommit: null,
      gitBranch: null,
    },
    license: { text: 'license' },
  }),
  formatVersion: (version: string) => version,
  formatBuildDate: (value: string) => value,
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import { AboutDialog } from './AboutDialog';

function updateResponse(
  overrides: Partial<CheckForUpdatesResponse> = {},
): CheckForUpdatesResponse {
  return {
    updaterStatus: 'ready',
    unavailableReason: null,
    updateAvailable: false,
    currentVersion: '0.2.8',
    latestVersion: null,
    releaseNotes: null,
    releaseDate: null,
    ...overrides,
  };
}

describe('AboutDialog manual update status', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<AboutDialog isOpen onClose={vi.fn()} />);
      await Promise.resolve();
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function checkForUpdates(): Promise<void> {
    const button = Array.from(container.querySelectorAll('button'))
      .find(candidate => candidate.textContent?.includes('update.checkForUpdates'));
    expect(button).toBeTruthy();
    await act(async () => {
      button?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it.each([
    'missing_configuration',
    'missing_endpoint',
    'missing_public_key',
  ] as const)('shows one actionable unavailable state for %s', async unavailableReason => {
    mocks.checkForUpdates.mockResolvedValue(updateResponse({
      updaterStatus: 'unconfigured',
      unavailableReason,
      updateAvailable: false,
    }));

    await checkForUpdates();

    expect(container.textContent).toContain('update.unavailable');
    expect(container.textContent).not.toContain('update.noUpdate');
    expect(container.querySelector('[data-testid="manual-update-dialog"]')).toBeNull();
    expect(container.querySelector('[data-testid="alert-error"]')).toBeNull();
  });

  it('shows latest only for a ready updater with no available update', async () => {
    mocks.checkForUpdates.mockResolvedValue(updateResponse());

    await checkForUpdates();

    expect(container.textContent).toContain('update.noUpdate');
    expect(container.textContent).not.toContain('update.unavailable');
    expect(container.querySelector('[data-testid="manual-update-dialog"]')).toBeNull();
  });

  it('opens the existing install dialog only for a ready available update', async () => {
    const response = updateResponse({
      updateAvailable: true,
      latestVersion: '0.2.9',
    });
    mocks.checkForUpdates.mockResolvedValue(response);

    await checkForUpdates();

    expect(container.querySelector('[data-testid="manual-update-dialog"]'))
      .toHaveProperty('dataset.latestVersion', response.latestVersion);
    expect(container.textContent).not.toContain('update.unavailable');
    expect(container.textContent).not.toContain('update.noUpdate');
  });

  it('keeps rejected checks in the error state', async () => {
    mocks.checkForUpdates.mockRejectedValue(new Error('offline'));

    await checkForUpdates();

    expect(container.querySelector('[data-testid="alert-error"]')?.textContent)
      .toBe('formatted:offline');
    expect(container.textContent).not.toContain('update.unavailable');
    expect(container.textContent).not.toContain('update.noUpdate');
    expect(container.querySelector('[data-testid="manual-update-dialog"]')).toBeNull();
  });
});
