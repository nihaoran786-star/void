// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComposerActionButton } from './ComposerActionButton';

vi.mock('@/component-library', () => ({
  IconButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ComposerActionButton', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onPrimaryAction = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onPrimaryAction.mockClear();
    onCancel.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(mode: 'send' | 'cancel' | 'retry' | 'split') {
    act(() => {
      root.render(
        <ComposerActionButton
          available
          mode={mode}
          hasDraft
          hasQueuedInput={false}
          customizationPersistencePending
          sendLabel="发送"
          retryLabel="重试"
          cancelLabel="停止"
          onPrimaryAction={onPrimaryAction}
          onCancel={onCancel}
        />,
      );
    });
  }

  it.each(['send', 'retry'] as const)(
    'pending 时禁用 %s 提交',
    mode => {
      render(mode);
      const button = container.querySelector('button')!;
      expect(button.disabled).toBe(true);
      act(() => button.click());
      expect(onPrimaryAction).not.toHaveBeenCalled();
    },
  );

  it('pending 时 split 发送禁用，但 split cancel 保持可用', () => {
    render('split');
    const cancel = container.querySelector(
      '[data-testid="chat-input-cancel-btn"]',
    ) as HTMLButtonElement;
    const send = container.querySelector(
      '[data-testid="chat-input-send-btn"]',
    ) as HTMLButtonElement;

    expect(send.disabled).toBe(true);
    act(() => {
      send.click();
      cancel.click();
    });
    expect(onPrimaryAction).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('pending 时 cancel 空草稿控制仍保持可用', () => {
    render('cancel');
    const cancel = container.querySelector('button') as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    act(() => cancel.click());
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  it('创建新会话时显示不可重复点击的进度按钮', () => {
    act(() => {
      root.render(
        <ComposerActionButton
          available
          mode="send"
          hasDraft
          hasQueuedInput={false}
          customizationPersistencePending={false}
          sessionCreationPending
          sendLabel="发送"
          creatingLabel="正在创建会话"
          onPrimaryAction={onPrimaryAction}
          onCancel={onCancel}
        />,
      );
    });

    const button = container.querySelector('button')!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('正在创建会话');
    expect(button.querySelector('.void-chat-input__send-button-spinner')).not.toBeNull();
    act(() => button.click());
    expect(onPrimaryAction).not.toHaveBeenCalled();
  });
});
