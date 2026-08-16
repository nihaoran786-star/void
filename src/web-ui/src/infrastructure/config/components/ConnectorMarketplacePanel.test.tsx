// @vitest-environment jsdom

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import ConnectorMarketplacePanel from './ConnectorMarketplacePanel';

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/component-library', () => ({
  Button: ({
    children,
    disabled,
    onClick,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    'aria-label'?: string;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  Input: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
  }) => <input value={value} onChange={onChange} />,
  Modal: ({
    children,
    isOpen,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
  }) => isOpen ? <div role="dialog">{children}</div> : null,
  Search: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => <input value={value} onChange={event => onChange(event.target.value)} />,
  ToolProcessingDots: () => <span>processing</span>,
}));

vi.mock('./ConnectorCatalogAvatar', () => ({
  default: ({ name }: { name: string }) => <span>{name}</span>,
}));

describe('ConnectorMarketplacePanel install behavior', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('keeps the connector installed when the subsequent list refresh fails', async () => {
    const installer = {
      install: vi.fn().mockResolvedValue({
        connectorId: 'memory',
        server: {
          id: 'memory',
          name: 'memory',
          status: 'Connected',
          serverType: 'Local',
          transport: 'stdio',
          enabled: true,
          autoStart: true,
          startSupported: true,
        },
      }),
    };
    const onInstalled = vi.fn().mockRejectedValue(new Error('refresh unavailable'));

    await act(async () => {
      root.render(
        <ConnectorMarketplacePanel
          installedIds={new Set()}
          onInstalled={onInstalled}
          installer={installer}
        />,
      );
    });
    const installButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="catalog.market.actions.installLabel"]',
    );
    expect(installButton).not.toBeNull();

    await act(async () => {
      installButton?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(installer.install).toHaveBeenCalledTimes(1);
    expect(onInstalled).toHaveBeenCalledTimes(1);
    expect(installButton?.disabled).toBe(true);
    expect(container.textContent).toContain('catalog.market.actions.installed');
    expect(container.textContent).toContain('catalog.market.status.refreshWarning');
    expect(container.querySelector('[role="status"]')).not.toBeNull();

    await act(async () => {
      installButton?.click();
      await Promise.resolve();
    });
    expect(installer.install).toHaveBeenCalledTimes(1);
  });
});
