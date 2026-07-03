import { describe, expect, it } from 'vitest';

import { createTerminalOutputPreview } from './terminalOutputPreview';

describe('terminalOutputPreview', () => {
  it('keeps short terminal output unchanged', () => {
    const output = 'line 1\nline 2\n';

    expect(createTerminalOutputPreview(output, {
      maxRows: 4,
      maxCharacters: 100,
    })).toEqual({
      content: output,
      wasTruncated: false,
      originalRowCount: 3,
      originalCharacterCount: output.length,
    });
  });

  it('keeps the latest rows within the character budget for long output', () => {
    const output = Array.from({ length: 12 }, (_, index) => `line-${index + 1}`).join('\n');

    const preview = createTerminalOutputPreview(output, {
      maxRows: 4,
      maxCharacters: 30,
    });

    expect(preview.wasTruncated).toBe(true);
    expect(preview.originalRowCount).toBe(12);
    expect(preview.originalCharacterCount).toBe(output.length);
    expect(preview.content).toBe('line-9\nline-10\nline-11\nline-12');
    expect(preview.content.length).toBeLessThanOrEqual(30);
  });
});
