// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  availableLoaded: vi.fn(),
  progressLoaded: vi.fn(),
}));

vi.mock('./UpdateAvailableDialog', () => {
  mocks.availableLoaded();
  return {
    UpdateAvailableDialog: () => <div data-testid="lazy-update-available" />,
  };
});

vi.mock('./UpdateInstallProgressModal', () => {
  mocks.progressLoaded();
  return {
    UpdateInstallProgressModal: () => <div data-testid="lazy-update-progress" />,
  };
});

import { LazyUpdateAvailableDialog } from './LazyUpdateAvailableDialog';
import { LazyUpdateInstallProgressModal } from './LazyUpdateInstallProgressModal';

const updateData = {
  updaterStatus: 'ready' as const,
  unavailableReason: null,
  updateAvailable: true,
  currentVersion: '0.2.8',
  latestVersion: '0.2.9',
  releaseNotes: null,
  releaseDate: null,
};

describe('lazy update dialog boundaries', () => {
  const containers: HTMLDivElement[] = [];

  afterEach(() => {
    for (const container of containers.splice(0)) {
      container.remove();
    }
    vi.clearAllMocks();
  });

  it('does not import either concrete dialog while closed', async () => {
    const container = document.createElement('div');
    containers.push(container);
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <LazyUpdateAvailableDialog
            isOpen={false}
            variant="daily"
            data={updateData}
            onLater={vi.fn()}
            onInstall={vi.fn()}
          />
          <LazyUpdateInstallProgressModal
            isOpen={false}
            error={null}
            progress={{ downloaded: 0, total: null }}
          />
        </>,
      );
      await Promise.resolve();
    });

    expect(mocks.availableLoaded).not.toHaveBeenCalled();
    expect(mocks.progressLoaded).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('loads each concrete dialog only after its visible state opens', async () => {
    const container = document.createElement('div');
    containers.push(container);
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <LazyUpdateAvailableDialog
            isOpen
            variant="daily"
            data={updateData}
            onLater={vi.fn()}
            onInstall={vi.fn()}
          />
          <LazyUpdateInstallProgressModal
            isOpen
            error={null}
            progress={{ downloaded: 1, total: 2 }}
          />
        </>,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="lazy-update-available"]'))
      .not.toBeNull();
    expect(container.querySelector('[data-testid="lazy-update-progress"]'))
      .not.toBeNull();
    expect(mocks.availableLoaded).toHaveBeenCalledTimes(1);
    expect(mocks.progressLoaded).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
