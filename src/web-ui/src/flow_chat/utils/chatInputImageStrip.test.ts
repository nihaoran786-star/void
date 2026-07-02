import { describe, expect, it } from 'vitest';

import { shouldShowChatInputImageStrip } from './chatInputImageStrip';

describe('shouldShowChatInputImageStrip', () => {
  it('hides image thumbnails while the chat input is collapsed', () => {
    expect(shouldShowChatInputImageStrip({
      imageCount: 1,
      isInputActive: false,
    })).toBe(false);
  });

  it('shows image thumbnails only when the input is active and has images', () => {
    expect(shouldShowChatInputImageStrip({
      imageCount: 1,
      isInputActive: true,
    })).toBe(true);
    expect(shouldShowChatInputImageStrip({
      imageCount: 0,
      isInputActive: true,
    })).toBe(false);
  });
});
