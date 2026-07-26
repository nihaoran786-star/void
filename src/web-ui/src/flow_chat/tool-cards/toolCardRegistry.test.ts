import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock('@/shared/utils/logger', () => ({
  createLogger: () => logger,
}));

import {
  getToolCardComponent,
  TOOL_CARD_COMPONENTS,
} from './toolCardRegistry';

describe('toolCardRegistry', () => {
  beforeEach(() => {
    logger.warn.mockClear();
  });

  it('keeps shared implementations as one stable lazy component', () => {
    expect(TOOL_CARD_COMPONENTS.Write).toBe(TOOL_CARD_COMPONENTS.Edit);
    expect(TOOL_CARD_COMPONENTS.Edit).toBe(TOOL_CARD_COMPONENTS.Delete);
    expect(TOOL_CARD_COMPONENTS.GenerateImage).toBe(TOOL_CARD_COMPONENTS.GenerateVideo);
    expect(TOOL_CARD_COMPONENTS.GenerateVideo).toBe(TOOL_CARD_COMPONENTS.GenerateSpeech);
    expect(getToolCardComponent('Read')).toBe(TOOL_CARD_COMPONENTS.Read);
    expect(getToolCardComponent('ViewImage')).toBe(TOOL_CARD_COMPONENTS.ViewImage);
    expect(getToolCardComponent('Read')).toBe(getToolCardComponent('Read'));
  });

  it('uses a shared MCP card without treating MCP names as unknown', () => {
    const first = getToolCardComponent('mcp__filesystem__read_file');
    const second = getToolCardComponent('mcp__github__search_code');

    expect(first).toBe(second);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('uses one default card and warns only once per unknown tool name', () => {
    const first = getToolCardComponent('UnknownLazyToolForTest');
    const second = getToolCardComponent('UnknownLazyToolForTest');

    expect(first).toBe(second);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Tool card component not found, using default',
      { toolName: 'UnknownLazyToolForTest' },
    );
  });
});
