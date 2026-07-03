import { describe, expect, it } from 'vitest';

import { createTerminalImeInputSafetyNet } from './terminalImeInputSafetyNet';

describe('createTerminalImeInputSafetyNet', () => {
  it('bypasses xterm key handling for keyCode 229 and forwards composed insertText data', () => {
    const safetyNet = createTerminalImeInputSafetyNet();

    expect(safetyNet.handleKeyEvent({ type: 'keydown', keyCode: 229 }).bypassXtermKeyHandling).toBe(true);
    expect(safetyNet.getInsertedTextFromInputEvent({
      data: 'a',
      inputType: 'insertText',
      composed: true,
    })).toBe('a');
  });

  it('does not forward insertText data already handled by keypress', () => {
    const safetyNet = createTerminalImeInputSafetyNet();

    safetyNet.handleKeyEvent({ type: 'keydown', keyCode: 229 });
    safetyNet.handleTextareaKeyPress();

    expect(safetyNet.getInsertedTextFromInputEvent({
      data: 'a',
      inputType: 'insertText',
      composed: true,
    })).toBeNull();
  });

  it('resets rollover tracking on keyup', () => {
    const safetyNet = createTerminalImeInputSafetyNet();

    safetyNet.handleKeyEvent({ type: 'keydown', keyCode: 229 });
    safetyNet.handleKeyEvent({ type: 'keyup', keyCode: 229 });

    expect(safetyNet.getInsertedTextFromInputEvent({
      data: 'a',
      inputType: 'insertText',
      composed: true,
    })).toBeNull();
  });

  it('does not forward composed input after normal keydown events', () => {
    const safetyNet = createTerminalImeInputSafetyNet();

    expect(safetyNet.handleKeyEvent({ type: 'keydown', keyCode: 65 }).bypassXtermKeyHandling).toBe(false);
    expect(safetyNet.getInsertedTextFromInputEvent({
      data: 'a',
      inputType: 'insertText',
      composed: true,
    })).toBeNull();
  });

  it('ignores input events that xterm can handle normally', () => {
    const safetyNet = createTerminalImeInputSafetyNet();

    safetyNet.handleKeyEvent({ type: 'keydown', keyCode: 229 });

    expect(safetyNet.getInsertedTextFromInputEvent({
      data: null,
      inputType: 'insertText',
      composed: true,
    })).toBeNull();
    expect(safetyNet.getInsertedTextFromInputEvent({
      data: 'a',
      inputType: 'deleteContentBackward',
      composed: true,
    })).toBeNull();
    expect(safetyNet.getInsertedTextFromInputEvent({
      data: 'a',
      inputType: 'insertText',
      composed: false,
    })).toBeNull();
  });
});
