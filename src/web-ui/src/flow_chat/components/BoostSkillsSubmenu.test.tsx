// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModeSkillInfo } from '@/infrastructure/config/types';
import { BoostSkillsSubmenu } from './BoostSkillsSubmenu';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('BoostSkillsSubmenu', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('preserves selection and keyboard focus behavior after lazy extraction', () => {
    const onSelectSkill = vi.fn();
    const onOpenLibrary = vi.fn();
    const skill = {
      key: 'cinematic-image',
      name: 'cinematic-image',
      description: 'Cinematic image generation',
      selectedForRuntime: true,
    } as ModeSkillInfo;

    act(() => {
      root.render(
        <BoostSkillsSubmenu
          skills={[skill]}
          loading={false}
          onSelectSkill={onSelectSkill}
          onOpenLibrary={onOpenLibrary}
        />,
      );
    });

    const trigger = host.querySelector<HTMLButtonElement>(
      '.void-chat-input__boost-submenu-trigger',
    )!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    act(() => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const skillItem = host.querySelector<HTMLButtonElement>(
      '.void-chat-input__boost-submenu-item',
    )!;
    expect(document.activeElement).toBe(skillItem);

    act(() => {
      skillItem.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    act(() => skillItem.click());
    expect(onSelectSkill).toHaveBeenCalledWith('cinematic-image');
    expect(onOpenLibrary).not.toHaveBeenCalled();
  });
});
