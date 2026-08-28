// @vitest-environment jsdom
/**
 * S4: the visible "refine on the canvas" entry on a short-drama card.
 *
 * Behaviour only. What matters here is what the button does NOT do as much as
 * what it does: it must not bubble the press into the card underneath (that
 * card moves the stage focus, which feeds the stage agents' context package),
 * and it must stay away entirely on assets the board cannot refine.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShortDramaArtifact } from '@/shared/services/short-drama/ShortDramaTypes';

vi.mock('@/infrastructure/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const warning = vi.fn();
vi.mock('@/shared/notification-system/services/NotificationService', () => ({
  notificationService: { warning: (...args: unknown[]) => warning(...args) },
}));

const {
  ArtifactSendToCanvasButton,
  ShortDramaCanvasHandoffProvider,
} = await import('./ShortDramaCanvasHandoffContext');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function artifact(overrides: Partial<ShortDramaArtifact> = {}) {
  return {
    id: 'artifact-1',
    title: 'Lin Xia',
    type: 'character',
    mediaReference: {
      mediaItemId: 'media-1',
      kind: 'image',
      relativePath: 'media/generated/batch-1/item-1.png',
    },
    ...overrides,
  } as ShortDramaArtifact;
}

describe('ArtifactSendToCanvasButton', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    warning.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const button = () => container.querySelector<HTMLButtonElement>(
    '[data-testid="short-drama-send-to-canvas"]',
  );

  function render(node: React.ReactNode) {
    act(() => root.render(<>{node}</>));
  }

  it('sends the asset without disturbing the card underneath', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'sent' });
    const onCardClick = vi.fn();
    render(
      <ShortDramaCanvasHandoffProvider send={send}>
        {/* Stands in for the card body, whose own click moves the stage focus. */}
        <div onClick={onCardClick}>
          <ArtifactSendToCanvasButton artifact={artifact()} />
        </div>
      </ShortDramaCanvasHandoffProvider>,
    );

    const entry = button();
    expect(entry).not.toBeNull();
    await act(async () => {
      entry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].id).toBe('artifact-1');
    // The stage focus lives on the card; sending a picture to the board is not
    // focusing an asset.
    expect(onCardClick).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it.each([
    ['unusable-picture', 'shortDrama.canvasHandoff.unusablePicture'],
    ['canvas-unavailable', 'shortDrama.canvasHandoff.unavailable'],
    ['not-refinable', 'shortDrama.canvasHandoff.unavailable'],
  ])('says out loud when the board refuses with %s', async (reason, message) => {
    const send = vi.fn().mockResolvedValue({ status: 'refused', reason });
    render(
      <ShortDramaCanvasHandoffProvider send={send}>
        <ArtifactSendToCanvasButton artifact={artifact()} />
      </ShortDramaCanvasHandoffProvider>,
    );

    await act(async () => {
      button()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0][0]).toBe(message);
  });

  it('goes back to being pressable once the send settles', async () => {
    let settle: (result: unknown) => void = () => undefined;
    const send = vi.fn().mockReturnValue(new Promise(resolve => { settle = resolve; }));
    render(
      <ShortDramaCanvasHandoffProvider send={send}>
        <ArtifactSendToCanvasButton artifact={artifact()} />
      </ShortDramaCanvasHandoffProvider>,
    );

    act(() => {
      button()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(button()?.disabled).toBe(true);

    await act(async () => {
      settle({ status: 'sent' });
    });
    expect(button()?.disabled).toBe(false);
  });

  it.each([
    ['an asset with no picture yet', artifact({ mediaReference: undefined })],
    ['a video asset', artifact({
      mediaReference: { mediaItemId: 'media-1', kind: 'video' },
    })],
    ['an asset type the board cannot own', artifact({ type: 'script' })],
  ])('stays away from %s', (_label, subject) => {
    render(
      <ShortDramaCanvasHandoffProvider send={vi.fn()}>
        <ArtifactSendToCanvasButton artifact={subject} />
      </ShortDramaCanvasHandoffProvider>,
    );

    expect(button()).toBeNull();
  });

  it('stays away where nothing is wired to receive it', () => {
    render(<ArtifactSendToCanvasButton artifact={artifact()} />);

    expect(button()).toBeNull();
  });
});
