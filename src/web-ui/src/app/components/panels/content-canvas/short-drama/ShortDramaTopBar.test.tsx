// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShortDramaTopBar } from './ShortDramaTopBar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ShortDramaTopBar', () => {
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

  it('exposes a roving tablist and activates stages with arrow keys', () => {
    const onStageSelect = vi.fn();
    act(() => {
      root.render(
        <ShortDramaTopBar
          selectedStage="assets"
          onStageSelect={onStageSelect}
          t={key => key}
        />,
      );
    });

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(tabs).toHaveLength(5);
    expect(tabs.map(tab => tab.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');

    act(() => {
      tabs[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onStageSelect).toHaveBeenCalledWith('storyboards');
  });

  it('does not duplicate the team control inside the stage navigation', () => {
    act(() => {
      root.render(
        <ShortDramaTopBar
          selectedStage="script"
          onStageSelect={() => undefined}
          t={key => key}
        />,
      );
    });

    expect(container.querySelector('[data-testid="short-drama-team-reopen"]'))
      .toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(5);
  });

});
