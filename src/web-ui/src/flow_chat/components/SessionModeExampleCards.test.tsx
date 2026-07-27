// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import SessionModeExampleCards from './SessionModeExampleCards';

describe('SessionModeExampleCards', () => {
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

  it('renders mode-specific prompts and sends the structured prompt on selection', async () => {
    const onSelectPrompt = vi.fn();
    await act(async () => {
      root.render(
        <SessionModeExampleCards
          mode="code"
          onSelectPrompt={onSelectPrompt}
        />,
      );
    });

    const options = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '.void-session-example-cards__option',
      ),
    );
    expect(options).toHaveLength(3);
    expect(options[0]?.textContent).toContain(
      'newSessionExamples.items.code.explain_code.title',
    );

    await act(async () => {
      options[0]?.click();
    });
    expect(onSelectPrompt).toHaveBeenCalledWith(
      'newSessionExamples.items.code.explain_code.prompt',
    );
  });

  it('rotates predictably and resets the examples when the mode changes', async () => {
    const onSelectPrompt = vi.fn();
    await act(async () => {
      root.render(
        <SessionModeExampleCards
          mode="code"
          onSelectPrompt={onSelectPrompt}
        />,
      );
    });

    const refresh = container.querySelector<HTMLButtonElement>(
      '.void-session-example-cards__refresh',
    );
    await act(async () => {
      refresh?.click();
    });
    expect(
      container.querySelector('.void-session-example-cards__option')
        ?.textContent,
    ).toContain('newSessionExamples.items.code.review_changes.title');

    await act(async () => {
      root.render(
        <SessionModeExampleCards
          mode="media"
          onSelectPrompt={onSelectPrompt}
        />,
      );
    });
    expect(
      container.querySelector('.void-session-example-cards__option')
        ?.textContent,
    ).toContain('newSessionExamples.items.media.create_storyboard.title');
  });
});
