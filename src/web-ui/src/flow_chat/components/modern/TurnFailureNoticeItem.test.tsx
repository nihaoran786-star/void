// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from '@/shared/utils/textSelection';
import { TurnFailureNoticeItem } from './TurnFailureNoticeItem';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/shared/utils/textSelection', () => ({
  copyTextToClipboard: vi.fn(),
}));

describe('TurnFailureNoticeItem', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(copyTextToClipboard).mockResolvedValue(true);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('renders an accessible summary and copies expanded diagnostics', async () => {
    act(() => {
      root.render(
        <TurnFailureNoticeItem
          error="Provider request failed"
          errorDetail={{ category: 'network', requestId: 'request-1', retryable: true }}
        />,
      );
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Provider request failed');
    expect(container.querySelector('details')).not.toBeNull();
    await act(async () => {
      (container.querySelector('button') as HTMLButtonElement).click();
    });
    expect(copyTextToClipboard).toHaveBeenCalledWith(expect.stringContaining('"requestId": "request-1"'));
    expect(container.textContent).toContain('turnFailureNotice.copied');
  });

  it.each([
    ['returns false', async () => false],
    ['throws', async () => { throw new Error('clipboard unavailable'); }],
  ])('shows copy failure feedback when the clipboard helper %s', async (_label, result) => {
    vi.mocked(copyTextToClipboard).mockImplementationOnce(result);
    act(() => {
      root.render(
        <TurnFailureNoticeItem
          error="Provider request failed"
          errorDetail={{ category: 'network', retryable: true }}
        />,
      );
    });

    await act(async () => {
      (container.querySelector('button') as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain('turnFailureNotice.copyFailed');
  });

  it('uses a unique accessible title id for each rendered instance', () => {
    act(() => {
      root.render(
        <>
          <TurnFailureNoticeItem
            error="First failure"
            errorDetail={{ category: 'network', retryable: true }}
          />
          <TurnFailureNoticeItem
            error="Second failure"
            errorDetail={{ category: 'provider', retryable: false }}
          />
        </>,
      );
    });

    const alerts = [...container.querySelectorAll<HTMLElement>('[role="alert"]')];
    const labelledBy = alerts.map(alert => alert.getAttribute('aria-labelledby'));

    expect(labelledBy[0]).toBeTruthy();
    expect(labelledBy[1]).toBeTruthy();
    expect(labelledBy[0]).not.toBe(labelledBy[1]);
    labelledBy.forEach((id, index) => {
      expect(alerts[index].querySelector('strong')?.id).toBe(id);
    });
  });
});
