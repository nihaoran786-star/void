import { describe, expect, it } from 'vitest';
import {
  getAllToolNames,
  getToolCardConfig,
  requiresConfirmation,
  TOOL_CARD_CONFIGS,
} from './toolCardMetadata';

describe('toolCardMetadata', () => {
  it('uses the metadata registry for non-default display names', () => {
    expect(getToolCardConfig('GetFileDiff')).toBe(TOOL_CARD_CONFIGS.GetFileDiff);
    expect(getToolCardConfig('GetFileDiff').displayName).toBe('File Diff');
    expect(getToolCardConfig('GenerateImage').displayName).toBe('Generate Image');
    expect(getToolCardConfig('InitMiniApp').displayName).toBe('Init Mini App');
  });

  it('keeps MCP display names derived from the parsed tool name', () => {
    expect(getToolCardConfig('mcp__filesystem__read_file')).toMatchObject({
      toolName: 'mcp__filesystem__read_file',
      displayName: 'read_file',
      icon: 'MCP',
    });
  });

  it('falls back explicitly for unknown tools', () => {
    expect(getToolCardConfig('UnknownTool')).toMatchObject({
      toolName: 'UnknownTool',
      displayName: 'Tool: UnknownTool',
      icon: 'TOOL',
    });
  });

  it('keeps confirmation policy in the metadata helper', () => {
    expect(requiresConfirmation('Bash')).toBe(true);
    expect(requiresConfirmation('Read')).toBe(false);
    expect(requiresConfirmation('mcp__filesystem__read_file')).toBe(false);
  });

  it('lists registered tools from the metadata source', () => {
    expect(getAllToolNames()).toContain('GenerativeUI');
    expect(getAllToolNames()).toContain('GetMediaTaskStatus');
  });
});
