// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import {
  SessionCapabilityRailOutletProvider,
  SessionCapabilityRailPortal,
} from '@/app/presentation/sessionCapabilityRailOutlet';
import { SessionCapabilityRail } from './SessionCapabilityRail';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SessionCapabilityRail', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('hosts the existing team control between tool capabilities and the canvas toggle', async () => {
    await act(async () => {
      root.render(
        <SessionCapabilityRailOutletProvider
          isCanvasExpanded
          ensureCanvasExpanded={vi.fn()}
        >
          <SessionCapabilityRail
            capabilities={[{
              id: 'short-drama',
              status: 'running',
              usageCount: 2,
              latestActivityAt: 1,
            }]}
            activeCapabilityId="short-drama"
            isCanvasExpanded
            onOpenCapability={vi.fn()}
            onCanvasToggle={vi.fn()}
          />
          <SessionCapabilityRailPortal>
            <button type="button" data-testid="projected-team-control">
              team
            </button>
          </SessionCapabilityRailPortal>
        </SessionCapabilityRailOutletProvider>,
      );
      await Promise.resolve();
    });

    const rail = container.querySelector(
      '[data-testid="session-capability-rail"]',
    );
    const outlet = container.querySelector(
      '[data-testid="session-capability-rail-team-outlet"]',
    );
    const teamControl = container.querySelector(
      '[data-testid="projected-team-control"]',
    );
    const canvasToggle = container.querySelector(
      '[data-testid="session-aux-pane-toggle"]',
    );

    expect(rail).not.toBeNull();
    expect(outlet?.contains(teamControl)).toBe(true);
    expect(
      outlet?.compareDocumentPosition(canvasToggle as Node)
        ?? Node.DOCUMENT_POSITION_PRECEDING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
