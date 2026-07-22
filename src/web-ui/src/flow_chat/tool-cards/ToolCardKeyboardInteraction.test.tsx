import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BaseToolCard,
  statusUsesLoadingShimmer,
  ToolCardHeader,
  type ToolCardStatus,
} from './BaseToolCard';
import {
  CompactToolCard,
  CompactToolCardHeader,
} from './CompactToolCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STATUSES: readonly ToolCardStatus[] = [
  'pending',
  'preparing',
  'streaming',
  'receiving',
  'running',
  'completed',
  'error',
  'cancelled',
  'analyzing',
  'pending_confirmation',
  'confirmed',
];

describe('shared tool-card keyboard interaction', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      pretendToBeVisual: true,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  const renderBase = (props: Partial<React.ComponentProps<typeof BaseToolCard>> = {}) => {
    act(() => {
      root.render(
        <BaseToolCard
          status="completed"
          header={(
            <ToolCardHeader
              icon={<span aria-hidden>·</span>}
              content="Base card"
            />
          )}
          {...props}
        />,
      );
    });
    return container.querySelector('.base-tool-card') as HTMLDivElement;
  };

  const renderCompact = (
    props: Partial<React.ComponentProps<typeof CompactToolCard>> = {},
  ) => {
    act(() => {
      root.render(
        <CompactToolCard
          status="completed"
          header={(
            <CompactToolCardHeader
              icon={<span aria-hidden>·</span>}
              content="Compact card"
            />
          )}
          {...props}
        />,
      );
    });
    return container.querySelector(
      '.compact-tool-card, .base-tool-card',
    ) as HTMLDivElement;
  };

  const click = (target: HTMLElement) => {
    act(() => target.click());
  };

  it('keeps the Base root ordinary and exposes one native activation button only when interactive', () => {
    const staticCard = renderBase({ headerExpandAffordance: true });
    expect(staticCard.getAttribute('role')).toBeNull();
    expect(staticCard.getAttribute('tabindex')).toBeNull();
    expect(staticCard.querySelector('.tool-card-header-activation')).toBeNull();

    const onClick = vi.fn();
    const card = renderBase({
      onClick,
      headerExpandAffordance: true,
    });
    const activation = card.querySelector(
      '.tool-card-header-activation',
    ) as HTMLButtonElement;
    expect(card.getAttribute('role')).toBeNull();
    expect(card.getAttribute('tabindex')).toBeNull();
    expect(activation.tagName).toBe('BUTTON');
    expect(activation.type).toBe('button');
    expect(activation.tabIndex).toBe(0);
    expect(activation.getAttribute('aria-label')).toBe('Expand details');

    click(activation);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the activation and nested action as independent accessible sibling controls', () => {
    const onClick = vi.fn();
    const nestedClick = vi.fn();
    const card = renderBase({
      onClick,
      headerExpandAffordance: true,
      header: (
        <ToolCardHeader
          icon={<span aria-hidden>·</span>}
          content="Base card"
          extra={(
            <button
              type="button"
              data-testid="nested-action"
              onClick={nestedClick}
            >
              Nested action
            </button>
          )}
        />
      ),
    });
    const activation = card.querySelector(
      '.tool-card-header-activation',
    ) as HTMLButtonElement;
    const nested = card.querySelector(
      '[data-testid="nested-action"]',
    ) as HTMLButtonElement;
    expect(activation.contains(nested)).toBe(false);
    expect(nested.tagName).toBe('BUTTON');
    expect(nested.textContent).toBe('Nested action');

    click(activation);
    click(nested);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(nestedClick).toHaveBeenCalledTimes(1);
  });

  it('announces inline state and explicit callback priority but omits state for open-right', () => {
    const contextualClick = vi.fn();
    const explicitClick = vi.fn();
    let card = renderBase({
      onClick: contextualClick,
      headerExpandAffordance: true,
      header: (
        <ToolCardHeader
          icon={<span aria-hidden>·</span>}
          content="Base card"
          onAffordanceClick={explicitClick}
        />
      ),
    });
    let activation = card.querySelector(
      '.tool-card-header-activation',
    ) as HTMLButtonElement;
    expect(activation.getAttribute('aria-expanded')).toBe('false');
    expect(activation.getAttribute('aria-label')).toBe('Expand details');
    click(activation);
    expect(explicitClick).toHaveBeenCalledTimes(1);
    expect(contextualClick).not.toHaveBeenCalled();

    card = renderBase({
      onClick: contextualClick,
      headerExpandAffordance: true,
      isExpanded: true,
    });
    activation = card.querySelector(
      '.tool-card-header-activation',
    ) as HTMLButtonElement;
    expect(activation.getAttribute('aria-expanded')).toBe('true');
    expect(activation.getAttribute('aria-label')).toBe('Collapse details');

    card = renderBase({
      onClick: contextualClick,
      headerExpandAffordance: true,
      headerAffordanceKind: 'open-panel-right',
    });
    activation = card.querySelector(
      '.tool-card-header-activation',
    ) as HTMLButtonElement;
    expect(activation.getAttribute('aria-expanded')).toBeNull();
    expect(activation.getAttribute('aria-label')).toBe('Open details');

    card = renderBase({
      onClick: contextualClick,
      headerExpandAffordance: true,
      headerAffordanceKind: 'open-panel-right',
      isExpanded: true,
      header: (
        <ToolCardHeader
          icon={<span aria-hidden>·</span>}
          content="Base card"
          affordanceKind="expand"
          headerExpanded={false}
        />
      ),
    });
    activation = card.querySelector(
      '.tool-card-header-activation',
    ) as HTMLButtonElement;
    expect(activation.getAttribute('aria-expanded')).toBe('false');
    expect(activation.getAttribute('aria-label')).toBe('Expand details');

    card = renderBase({
      onClick: contextualClick,
      headerExpandAffordance: true,
      header: (
        <ToolCardHeader
          icon={<span aria-hidden>·</span>}
          content="Base card"
          expandAffordance={false}
        />
      ),
    });
    expect(card.querySelector('.tool-card-header-activation')).toBeNull();
  });

  it('requires clickable and onClick for Compact activation and blocks phantom mouse clicks', () => {
    expect(renderCompact({ clickable: true }).querySelector(
      '.tool-card-header-activation',
    )).toBeNull();

    const onClick = vi.fn();
    let card = renderCompact({ onClick });
    expect(card.getAttribute('role')).toBeNull();
    expect(card.querySelector('.tool-card-header-activation')).toBeNull();
    click(card);
    expect(onClick).not.toHaveBeenCalled();

    card = renderCompact({ clickable: true, onClick });
    let activation = card.querySelector(
      '.tool-card-header-activation',
    ) as HTMLButtonElement;
    expect(card.getAttribute('role')).toBeNull();
    expect(activation.tagName).toBe('BUTTON');
    expect(activation.getAttribute('aria-label')).toBe('Expand details');
    expect(activation.getAttribute('aria-expanded')).toBe('false');
    click(activation);
    expect(onClick).toHaveBeenCalledTimes(1);

    card = renderCompact({
      clickable: true,
      onClick,
      header: (
        <CompactToolCardHeader
          affordanceKind="open-panel-right"
          icon={<span aria-hidden>·</span>}
          content="Open in editor"
        />
      ),
    });
    activation = card.querySelector(
      '.tool-card-header-activation',
    ) as HTMLButtonElement;
    expect(activation.getAttribute('aria-label')).toBe('Open details');
    expect(activation.getAttribute('aria-expanded')).toBeNull();
  });

  it('keeps expanded non-interactive Compact cards free of callbacks and ghost controls', () => {
    const onClick = vi.fn();
    const expandedContent = <div>Expanded content</div>;

    let card = renderCompact({
      onClick,
      isExpanded: true,
      expandedContent,
    });
    expect(card.querySelector('.tool-card-header-activation')).toBeNull();
    click(card);
    expect(onClick).not.toHaveBeenCalled();

    card = renderCompact({
      clickable: true,
      onClick,
      isExpanded: true,
      expandedContent,
    });
    const activation = card.querySelector(
      '.tool-card-header-activation',
    ) as HTMLButtonElement;
    expect(card.getAttribute('role')).toBeNull();
    expect(activation.getAttribute('aria-label')).toBe('Collapse details');
    expect(activation.getAttribute('aria-expanded')).toBe('true');
    click(activation);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps nested controls and selected card text out of the mouse toggle path', () => {
    const onClick = vi.fn();
    const card = renderBase({
      onClick,
      headerExpandAffordance: true,
      header: (
        <ToolCardHeader
          icon={<span aria-hidden>·</span>}
          content={<span>Selectable text</span>}
          extra={<button type="button">Nested action</button>}
        />
      ),
    });
    click(card.querySelector('.tool-card-extra button') as HTMLButtonElement);
    expect(onClick).not.toHaveBeenCalled();

    const text = card.querySelector('.tool-card-content span')!.firstChild!;
    const range = dom.window.document.createRange();
    range.selectNodeContents(text);
    const selection = dom.window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    click(card);
    expect(onClick).not.toHaveBeenCalled();

    selection.removeAllRanges();
    click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the loading shimmer classification exhaustive for the status union', () => {
    expect(STATUSES.filter(statusUsesLoadingShimmer)).toEqual([
      'preparing',
      'streaming',
      'receiving',
      'running',
      'analyzing',
    ]);

    for (const status of STATUSES) {
      const card = renderCompact({ status });
      expect(card.classList.contains(`status-${status}`)).toBe(true);
      expect(
        card.parentElement?.classList.contains(
          'compact-tool-card-wrapper--loading-shimmer',
        ),
      ).toBe(statusUsesLoadingShimmer(status));
    }
  });
});
